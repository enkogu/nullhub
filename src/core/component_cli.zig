const std = @import("std");
const std_compat = @import("compat");

pub const CliError = error{
    CommandFailed,
};

pub const RunResult = struct {
    stdout: []const u8,
    stderr: []const u8,
    success: bool,
};

const ReadThreadResult = struct {
    bytes: []u8 = &.{},
    err: ?anyerror = null,
};

const WaitThreadResult = struct {
    done: std.atomic.Value(bool) = std.atomic.Value(bool).init(false),
    term: std_compat.process.Child.Term = undefined,
    err: ?anyerror = null,
};

/// Run a component binary with the given arguments and capture stdout.
/// Caller owns the returned stdout and stderr slices.
pub fn run(allocator: std.mem.Allocator, binary_path: []const u8, args: []const []const u8, cwd: ?[]const u8) !RunResult {
    return runWithComponentHome(allocator, "", binary_path, args, cwd, null);
}

pub fn homeEnvVarForComponent(component_name: []const u8) ?[]const u8 {
    if (std.mem.eql(u8, component_name, "nullclaw")) return "NULLCLAW_HOME";
    if (std.mem.eql(u8, component_name, "nullboiler")) return "NULLBOILER_HOME";
    if (std.mem.eql(u8, component_name, "nulltickets")) return "NULLTICKETS_HOME";
    if (std.mem.eql(u8, component_name, "nullwatch")) return "NULLWATCH_HOME";
    return null;
}

/// Run a component binary with an optional component-specific HOME override.
/// Caller owns the returned stdout and stderr slices.
pub fn runWithComponentHome(
    allocator: std.mem.Allocator,
    component_name: []const u8,
    binary_path: []const u8,
    args: []const []const u8,
    cwd: ?[]const u8,
    component_home: ?[]const u8,
) !RunResult {
    return runWithComponentHomeLimited(allocator, component_name, binary_path, args, cwd, component_home, 50 * 1024);
}

pub fn runWithComponentHomeLimited(
    allocator: std.mem.Allocator,
    component_name: []const u8,
    binary_path: []const u8,
    args: []const []const u8,
    cwd: ?[]const u8,
    component_home: ?[]const u8,
    max_output_bytes: usize,
) !RunResult {
    return runWithComponentHomeLimitedTimeout(allocator, component_name, binary_path, args, cwd, component_home, max_output_bytes, null);
}

pub fn runWithComponentHomeLimitedTimeout(
    allocator: std.mem.Allocator,
    component_name: []const u8,
    binary_path: []const u8,
    args: []const []const u8,
    cwd: ?[]const u8,
    component_home: ?[]const u8,
    max_output_bytes: usize,
    timeout_ms: ?u64,
) !RunResult {
    // Build argv: binary + args
    var argv = std.array_list.Managed([]const u8).init(allocator);
    defer argv.deinit();
    try argv.append(binary_path);
    for (args) |arg| try argv.append(arg);

    var env_map_opt: ?std_compat.process.EnvMap = null;
    defer {
        if (env_map_opt) |*env_map| env_map.deinit();
    }
    if (component_home) |home| {
        const env_name = homeEnvVarForComponent(component_name) orelse "";
        if (env_name.len > 0) {
            var env_map = try std_compat.process.getEnvMap(allocator);
            try env_map.put(env_name, home);
            env_map_opt = env_map;
        }
    }

    if (timeout_ms) |limit_ms| {
        return runCapturedWithTimeout(
            allocator,
            argv.items,
            cwd,
            if (env_map_opt) |*env_map| env_map else null,
            max_output_bytes,
            limit_ms,
        );
    }

    const result = std_compat.process.Child.run(.{
        .allocator = allocator,
        .argv = argv.items,
        .cwd = cwd,
        .env_map = if (env_map_opt) |*env_map| env_map else null,
        .max_output_bytes = max_output_bytes,
    }) catch return error.CommandFailed;

    return .{
        .stdout = result.stdout,
        .stderr = result.stderr,
        .success = switch (result.term) {
            .exited => |code| code == 0,
            else => false,
        },
    };
}

fn readPipeToEnd(file: std_compat.fs.File, allocator: std.mem.Allocator, max_output_bytes: usize, out: *ReadThreadResult) void {
    defer file.close();
    out.bytes = file.readToEndAlloc(allocator, max_output_bytes) catch |err| {
        out.err = err;
        return;
    };
}

fn waitForChild(child: *std_compat.process.Child, out: *WaitThreadResult) void {
    out.term = child.wait() catch |err| {
        out.err = err;
        out.done.store(true, .release);
        return;
    };
    out.done.store(true, .release);
}

fn makeTimeoutResult(allocator: std.mem.Allocator, stdout: []u8, stderr: []u8, timeout_ms: u64) !RunResult {
    const timeout_msg = try std.fmt.allocPrint(allocator, "component CLI timed out after {d}ms", .{timeout_ms});
    if (stderr.len > 0) allocator.free(stderr);
    return .{
        .stdout = stdout,
        .stderr = timeout_msg,
        .success = false,
    };
}

fn runCapturedWithTimeout(
    allocator: std.mem.Allocator,
    argv: []const []const u8,
    cwd: ?[]const u8,
    env_map: ?*const std_compat.process.EnvMap,
    max_output_bytes: usize,
    timeout_ms: u64,
) !RunResult {
    var child = std_compat.process.Child.init(argv, allocator);
    child.cwd = cwd;
    child.env_map = env_map;
    child.stdout_behavior = .Pipe;
    child.stderr_behavior = .Pipe;
    try child.spawn();

    var stdout_result: ReadThreadResult = .{};
    var stderr_result: ReadThreadResult = .{};
    var wait_result: WaitThreadResult = .{};

    const stdout_file = child.stdout orelse return error.CommandFailed;
    const stderr_file = child.stderr orelse return error.CommandFailed;
    const stdout_thread = try std.Thread.spawn(.{}, readPipeToEnd, .{ stdout_file, allocator, max_output_bytes, &stdout_result });
    const stderr_thread = try std.Thread.spawn(.{}, readPipeToEnd, .{ stderr_file, allocator, max_output_bytes, &stderr_result });
    const wait_thread = try std.Thread.spawn(.{}, waitForChild, .{ &child, &wait_result });

    const started_ms: u64 = @intCast(std_compat.time.milliTimestamp());
    var timed_out = false;
    while (!wait_result.done.load(.acquire)) {
        const now_ms: u64 = @intCast(std_compat.time.milliTimestamp());
        if (now_ms - started_ms >= timeout_ms) {
            timed_out = true;
            _ = child.kill() catch {};
            break;
        }
        std_compat.thread.sleep(25 * std.time.ns_per_ms);
    }

    wait_thread.join();
    stdout_thread.join();
    stderr_thread.join();

    const stdout = stdout_result.bytes;
    const stderr = stderr_result.bytes;
    if (stdout_result.err != null or stderr_result.err != null or wait_result.err != null) {
        if (stdout.len > 0) allocator.free(stdout);
        if (stderr.len > 0) allocator.free(stderr);
        return error.CommandFailed;
    }

    if (timed_out) {
        return makeTimeoutResult(allocator, stdout, stderr, timeout_ms);
    }

    return .{
        .stdout = stdout,
        .stderr = stderr,
        .success = switch (wait_result.term) {
            .exited => |code| code == 0,
            else => false,
        },
    };
}

/// Run --export-manifest on a component binary and return the raw JSON.
pub fn exportManifest(allocator: std.mem.Allocator, binary_path: []const u8) ![]const u8 {
    const result = try run(allocator, binary_path, &.{"--export-manifest"}, null);
    defer allocator.free(result.stderr);
    if (!result.success) {
        allocator.free(result.stdout);
        return error.CommandFailed;
    }
    return result.stdout;
}

/// Run --list-models on a component binary and return the raw JSON array.
pub fn listModels(allocator: std.mem.Allocator, binary_path: []const u8, provider: []const u8, api_key: []const u8) ![]const u8 {
    const result = try run(allocator, binary_path, &.{ "--list-models", "--provider", provider, "--api-key", api_key }, null);
    defer allocator.free(result.stderr);
    if (!result.success) {
        allocator.free(result.stdout);
        return error.CommandFailed;
    }
    return result.stdout;
}

pub const FromJsonResult = struct {
    stdout: []const u8,
    stderr: []const u8,
    success: bool,
};

/// Run --from-json on a component binary with the given JSON answers.
/// The JSON should include a "home" field for instance isolation (injected by orchestrator).
pub fn fromJson(
    allocator: std.mem.Allocator,
    component_name: []const u8,
    binary_path: []const u8,
    json_answers: []const u8,
    cwd: ?[]const u8,
    component_home: ?[]const u8,
) !FromJsonResult {
    const result = try runWithComponentHome(
        allocator,
        component_name,
        binary_path,
        &.{ "--from-json", json_answers },
        cwd,
        component_home,
    );
    return .{
        .stdout = result.stdout,
        .stderr = result.stderr,
        .success = result.success,
    };
}

test "home env var includes managed components" {
    try std.testing.expectEqualStrings("NULLCLAW_HOME", homeEnvVarForComponent("nullclaw").?);
    try std.testing.expectEqualStrings("NULLBOILER_HOME", homeEnvVarForComponent("nullboiler").?);
    try std.testing.expectEqualStrings("NULLTICKETS_HOME", homeEnvVarForComponent("nulltickets").?);
    try std.testing.expectEqualStrings("NULLWATCH_HOME", homeEnvVarForComponent("nullwatch").?);
    try std.testing.expect(homeEnvVarForComponent("unknown") == null);
}

test "runWithComponentHomeLimitedTimeout terminates slow commands" {
    if (@import("builtin").os.tag == .windows) return error.SkipZigTest;

    const result = try runWithComponentHomeLimitedTimeout(
        std.testing.allocator,
        "",
        "/bin/sh",
        &.{ "-c", "sleep 2; echo late" },
        null,
        null,
        1024,
        100,
    );
    defer std.testing.allocator.free(result.stdout);
    defer std.testing.allocator.free(result.stderr);

    try std.testing.expect(!result.success);
    try std.testing.expect(std.mem.indexOf(u8, result.stderr, "timed out") != null);
}
