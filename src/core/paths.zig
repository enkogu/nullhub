const std = @import("std");
const std_compat = @import("compat");
const builtin = @import("builtin");

/// Directory resolution for all paths under `~/.nullhub/`.
///
/// Layout:
/// ```
/// ~/.nullhub/
/// ├── config.json
/// ├── state.json
/// ├── mission-control/replays/{id}.json
/// ├── manifests/{component}@{version}.json
/// ├── spaces/{space_id}/market/library/{package}.json
/// ├── bin/{component}-{version} (or bin/{component} for dev-local)
/// ├── instances/{component}/{name}/
/// │   ├── instance.json
/// │   ├── config.json
/// │   ├── data/
/// │   └── logs/
/// ├── ui/{module}@{version}/
/// └── cache/downloads/
/// ```
pub const Paths = struct {
    root: []const u8,

    /// Initialize a Paths struct. If `custom_root` is null, resolves from
    /// NULLHUB_HOME first, then HOME (producing `$HOME/.nullhub`).
    /// The returned root string is owned by the allocator.
    pub fn init(allocator: std.mem.Allocator, custom_root: ?[]const u8) !Paths {
        if (custom_root) |cr| {
            return .{ .root = try allocator.dupe(u8, cr) };
        }
        if (getNormalizedEnvVarOwned(allocator, "NULLHUB_HOME")) |root| {
            return .{ .root = root };
        }
        const home = try getHomeDirOwned(allocator);
        defer allocator.free(home);
        const root = try std.fs.path.join(allocator, &.{ home, ".nullhub" });
        return .{ .root = root };
    }

    /// Free the root string.
    pub fn deinit(self: *Paths, allocator: std.mem.Allocator) void {
        allocator.free(self.root);
        self.* = undefined;
    }

    // ── Singleton paths ──────────────────────────────────────────────

    /// `{root}/config.json`
    pub fn config(self: Paths, allocator: std.mem.Allocator) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "config.json" });
    }

    /// `{root}/state.json`
    pub fn state(self: Paths, allocator: std.mem.Allocator) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "state.json" });
    }

    /// `{root}/dispatcher`
    pub fn dispatcherDir(self: Paths, allocator: std.mem.Allocator) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "dispatcher" });
    }

    /// `{root}/dispatcher/cursor.json`
    pub fn dispatcherCursor(self: Paths, allocator: std.mem.Allocator) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "dispatcher", "cursor.json" });
    }

    /// `{root}/mission-control/replays`
    pub fn missionReplayDir(self: Paths, allocator: std.mem.Allocator) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "mission-control", "replays" });
    }

    /// `{root}/spaces/{space_id}`
    pub fn spaceDir(self: Paths, allocator: std.mem.Allocator, space_id: []const u8) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "spaces", space_id });
    }

    /// `{root}/spaces/{space_id}/orders`
    pub fn spaceOrdersDir(self: Paths, allocator: std.mem.Allocator, space_id: []const u8) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "spaces", space_id, "orders" });
    }

    /// `{root}/spaces/{space_id}/orders/orders.json`
    pub fn spaceOrdersTable(self: Paths, allocator: std.mem.Allocator, space_id: []const u8) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "spaces", space_id, "orders", "orders.json" });
    }

    /// `{root}/spaces/{space_id}/orders/{order_id}.md`
    pub fn spaceOrderDoc(self: Paths, allocator: std.mem.Allocator, space_id: []const u8, order_id: []const u8) ![]const u8 {
        const filename = try std.fmt.allocPrint(allocator, "{s}.md", .{order_id});
        defer allocator.free(filename);
        return std.fs.path.join(allocator, &.{ self.root, "spaces", space_id, "orders", filename });
    }

    /// `{root}/spaces/{space_id}/charter.md`
    pub fn spaceCharterDoc(self: Paths, allocator: std.mem.Allocator, space_id: []const u8) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "spaces", space_id, "charter.md" });
    }

    /// `{root}/spaces/{space_id}/market/library`
    pub fn spacePackageLibraryDir(self: Paths, allocator: std.mem.Allocator, space_id: []const u8) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "spaces", space_id, "market", "library" });
    }

    /// `{root}/spaces/{space_id}/market/library/{package_id}.json`
    pub fn spacePackageLibraryManifest(self: Paths, allocator: std.mem.Allocator, space_id: []const u8, package_id: []const u8) ![]const u8 {
        const filename = try std.fmt.allocPrint(allocator, "{s}.json", .{package_id});
        defer allocator.free(filename);
        return std.fs.path.join(allocator, &.{ self.root, "spaces", space_id, "market", "library", filename });
    }

    // ── Component paths ──────────────────────────────────────────────

    /// `{root}/manifests/{component}@{version}.json`
    pub fn manifest(self: Paths, allocator: std.mem.Allocator, component: []const u8, version: []const u8) ![]const u8 {
        const filename = try std.fmt.allocPrint(allocator, "{s}@{s}.json", .{ component, version });
        defer allocator.free(filename);
        return std.fs.path.join(allocator, &.{ self.root, "manifests", filename });
    }

    /// `{root}/bin/{component}-{version}` (or `.exe` on Windows).
    /// For `dev-local`, use the canonical component basename instead so locally
    /// staged binaries behave the same as the original executable.
    pub fn binary(self: Paths, allocator: std.mem.Allocator, component: []const u8, version: []const u8) ![]const u8 {
        const filename = if (std.mem.eql(u8, version, "dev-local"))
            if (builtin.os.tag == .windows)
                try std.fmt.allocPrint(allocator, "{s}.exe", .{component})
            else
                try allocator.dupe(u8, component)
        else if (builtin.os.tag == .windows)
            try std.fmt.allocPrint(allocator, "{s}-{s}.exe", .{ component, version })
        else
            try std.fmt.allocPrint(allocator, "{s}-{s}", .{ component, version });
        defer allocator.free(filename);
        return std.fs.path.join(allocator, &.{ self.root, "bin", filename });
    }

    // ── Instance paths ───────────────────────────────────────────────

    /// `{root}/instances/{component}/{name}`
    pub fn instanceDir(self: Paths, allocator: std.mem.Allocator, component: []const u8, name: []const u8) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "instances", component, name });
    }

    /// `{root}/instances/{component}/{name}/config.json`
    pub fn instanceConfig(self: Paths, allocator: std.mem.Allocator, component: []const u8, name: []const u8) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "instances", component, name, "config.json" });
    }

    /// `{root}/instances/{component}/{name}/data`
    pub fn instanceData(self: Paths, allocator: std.mem.Allocator, component: []const u8, name: []const u8) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "instances", component, name, "data" });
    }

    /// `{root}/instances/{component}/{name}/logs`
    pub fn instanceLogs(self: Paths, allocator: std.mem.Allocator, component: []const u8, name: []const u8) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "instances", component, name, "logs" });
    }

    /// `{root}/instances/{component}/{name}/instance.json`
    pub fn instanceMeta(self: Paths, allocator: std.mem.Allocator, component: []const u8, name: []const u8) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "instances", component, name, "instance.json" });
    }

    /// `{root}/instances/{component}/{name}/workspace`
    pub fn instanceWorkspaceDir(self: Paths, allocator: std.mem.Allocator, component: []const u8, name: []const u8) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "instances", component, name, "workspace" });
    }

    // ── UI module paths ──────────────────────────────────────────────

    /// `{root}/ui/{module_name}@{version}`
    pub fn uiModule(self: Paths, allocator: std.mem.Allocator, module_name: []const u8, version: []const u8) ![]const u8 {
        const dirname = try std.fmt.allocPrint(allocator, "{s}@{s}", .{ module_name, version });
        defer allocator.free(dirname);
        return std.fs.path.join(allocator, &.{ self.root, "ui", dirname });
    }

    // ── Cache paths ──────────────────────────────────────────────────

    /// `{root}/cache/downloads`
    pub fn cacheDownloads(self: Paths, allocator: std.mem.Allocator) ![]const u8 {
        return std.fs.path.join(allocator, &.{ self.root, "cache", "downloads" });
    }

    // ── Directory creation ───────────────────────────────────────────

    /// Create all required subdirectories under root.
    pub fn ensureDirs(self: Paths) !void {
        const dirs = [_][]const u8{
            "manifests",
            "bin",
            "instances",
            "spaces",
            "dispatcher",
            "ui",
            "mission-control/replays",
            "cache/downloads",
            "cache/usage",
        };
        for (dirs) |sub| {
            // Use makePath on an absolute directory via cwd handle.
            // std.fs.path.join would need an allocator; instead we open root
            // and create the sub-path relative to it.
            try makeAbsSubpath(self.root, sub);
        }
    }
};

fn getHomeDirOwned(allocator: std.mem.Allocator) ![]u8 {
    return std_compat.process.getEnvVarOwned(allocator, "HOME") catch |err| switch (err) {
        error.EnvironmentVariableNotFound => {
            if (builtin.os.tag == .windows) {
                return std_compat.process.getEnvVarOwned(allocator, "USERPROFILE") catch error.HomeNotSet;
            }
            return error.HomeNotSet;
        },
        else => return err,
    };
}

fn getNormalizedEnvVarOwned(allocator: std.mem.Allocator, key: []const u8) ?[]u8 {
    const value = std_compat.process.getEnvVarOwned(allocator, key) catch return null;
    errdefer allocator.free(value);

    const trimmed = std.mem.trim(u8, value, " \r\n\t");
    if (trimmed.len == 0) {
        allocator.free(value);
        return null;
    }
    if (trimmed.ptr == value.ptr and trimmed.len == value.len) {
        return value;
    }

    const normalized = allocator.dupe(u8, trimmed) catch return null;
    allocator.free(value);
    return normalized;
}

pub fn getTempDirOwned(allocator: std.mem.Allocator) ![]u8 {
    if (builtin.os.tag == .windows) {
        const keys = [_][]const u8{ "TEMP", "TMP" };
        for (keys) |key| {
            if (getNormalizedEnvVarOwned(allocator, key)) |value| return value;
        }

        const home = try getHomeDirOwned(allocator);
        defer allocator.free(home);
        return std.fs.path.join(allocator, &.{ home, "AppData", "Local", "Temp" });
    }

    if (getNormalizedEnvVarOwned(allocator, "TMPDIR")) |value| return value;
    return allocator.dupe(u8, "/tmp");
}

pub fn uniqueTempPathAlloc(
    allocator: std.mem.Allocator,
    prefix: []const u8,
    suffix: []const u8,
) ![]u8 {
    const temp_dir = try getTempDirOwned(allocator);
    defer allocator.free(temp_dir);

    const leaf = try std.fmt.allocPrint(allocator, "{s}-{d}-{x}{s}", .{
        prefix,
        @abs(std_compat.time.milliTimestamp()),
        std_compat.crypto.random.int(u64),
        suffix,
    });
    defer allocator.free(leaf);

    return std.fs.path.join(allocator, &.{ temp_dir, leaf });
}

/// Helper: create `{base}/{sub}` as an absolute directory tree.
fn makeAbsSubpath(base: []const u8, sub: []const u8) !void {
    // Open the root directory (create it first if needed).
    var root_dir = std_compat.fs.openDirAbsolute(base, .{}) catch |err| switch (err) {
        error.FileNotFound => {
            // Root doesn't exist — create it then retry.
            try std_compat.fs.makeDirAbsolute(base);
            return makeAbsSubpath(base, sub);
        },
        else => return err,
    };
    defer root_dir.close();
    try root_dir.makePath(sub);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test "paths resolve under custom root" {
    const allocator = std.testing.allocator;
    var p = try Paths.init(allocator, "/tmp/test-nullhub");
    defer p.deinit(allocator);

    const cfg = try p.config(allocator);
    defer allocator.free(cfg);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/config.json", cfg);

    const st = try p.state(allocator);
    defer allocator.free(st);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/state.json", st);

    const dispatcher_dir = try p.dispatcherDir(allocator);
    defer allocator.free(dispatcher_dir);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/dispatcher", dispatcher_dir);

    const dispatcher_cursor = try p.dispatcherCursor(allocator);
    defer allocator.free(dispatcher_cursor);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/dispatcher/cursor.json", dispatcher_cursor);

    const mf = try p.manifest(allocator, "nullclaw", "2026.3.1");
    defer allocator.free(mf);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/manifests/nullclaw@2026.3.1.json", mf);

    const bin = try p.binary(allocator, "nullclaw", "2026.3.1");
    defer allocator.free(bin);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/bin/nullclaw-2026.3.1", bin);

    const dev_bin = try p.binary(allocator, "nullclaw", "dev-local");
    defer allocator.free(dev_bin);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/bin/nullclaw", dev_bin);

    const inst_dir = try p.instanceDir(allocator, "nullclaw", "my-agent");
    defer allocator.free(inst_dir);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/instances/nullclaw/my-agent", inst_dir);

    const inst = try p.instanceConfig(allocator, "nullclaw", "my-agent");
    defer allocator.free(inst);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/instances/nullclaw/my-agent/config.json", inst);

    const data = try p.instanceData(allocator, "nullclaw", "my-agent");
    defer allocator.free(data);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/instances/nullclaw/my-agent/data", data);

    const logs = try p.instanceLogs(allocator, "nullclaw", "my-agent");
    defer allocator.free(logs);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/instances/nullclaw/my-agent/logs", logs);

    const meta = try p.instanceMeta(allocator, "nullclaw", "my-agent");
    defer allocator.free(meta);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/instances/nullclaw/my-agent/instance.json", meta);

    const workspace = try p.instanceWorkspaceDir(allocator, "nullclaw", "my-agent");
    defer allocator.free(workspace);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/instances/nullclaw/my-agent/workspace", workspace);

    const space_dir = try p.spaceDir(allocator, "ops");
    defer allocator.free(space_dir);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/spaces/ops", space_dir);

    const orders_dir = try p.spaceOrdersDir(allocator, "ops");
    defer allocator.free(orders_dir);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/spaces/ops/orders", orders_dir);

    const orders_table = try p.spaceOrdersTable(allocator, "ops");
    defer allocator.free(orders_table);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/spaces/ops/orders/orders.json", orders_table);

    const order_doc = try p.spaceOrderDoc(allocator, "ops", "order-1");
    defer allocator.free(order_doc);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/spaces/ops/orders/order-1.md", order_doc);

    const package_library = try p.spacePackageLibraryDir(allocator, "ops");
    defer allocator.free(package_library);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/spaces/ops/market/library", package_library);

    const package_manifest = try p.spacePackageLibraryManifest(allocator, "ops", "builtin.ops-desk");
    defer allocator.free(package_manifest);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/spaces/ops/market/library/builtin.ops-desk.json", package_manifest);

    const ui = try p.uiModule(allocator, "nullclaw-chat-ui", "1.2.0");
    defer allocator.free(ui);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/ui/nullclaw-chat-ui@1.2.0", ui);

    const dl = try p.cacheDownloads(allocator);
    defer allocator.free(dl);
    try std.testing.expectEqualStrings("/tmp/test-nullhub/cache/downloads", dl);
}

test "ensureDirs creates all subdirectories" {
    const allocator = std.testing.allocator;

    // Use a unique temp directory to avoid interference.
    const tmp_root = "/tmp/test-nullhub-ensure-dirs";

    // Clean up from any previous run.
    std_compat.fs.deleteTreeAbsolute(tmp_root) catch {};

    var p = try Paths.init(allocator, tmp_root);
    defer p.deinit(allocator);

    try p.ensureDirs();

    // Verify every expected subdirectory exists.
    const expected = [_][]const u8{
        "/tmp/test-nullhub-ensure-dirs/manifests",
        "/tmp/test-nullhub-ensure-dirs/bin",
        "/tmp/test-nullhub-ensure-dirs/instances",
        "/tmp/test-nullhub-ensure-dirs/dispatcher",
        "/tmp/test-nullhub-ensure-dirs/ui",
        "/tmp/test-nullhub-ensure-dirs/cache/downloads",
        "/tmp/test-nullhub-ensure-dirs/cache/usage",
    };
    for (expected) |dir| {
        var d = try std_compat.fs.openDirAbsolute(dir, .{});
        d.close();
    }

    // Clean up.
    std_compat.fs.deleteTreeAbsolute(tmp_root) catch {};
}

/// libc setenv/unsetenv for env-var round-trip tests; not exposed by std.c
/// in Zig 0.16. Posix-only — the tests above are Windows-skipped.
const testenv = struct {
    extern "c" fn setenv(name: [*:0]const u8, value: [*:0]const u8, overwrite: c_int) c_int;
    extern "c" fn unsetenv(name: [*:0]const u8) c_int;
};

/// Like getEnvVarOwned but null-terminated so the value can be handed back
/// to setenv when restoring.
fn getEnvVarOwnedZ(allocator: std.mem.Allocator, name: []const u8) ?[:0]u8 {
    const raw = std_compat.process.getEnvVarOwned(allocator, name) catch return null;
    defer allocator.free(raw);
    return allocator.dupeZ(u8, raw) catch null;
}

test "init without custom root reads NULLHUB_HOME" {
    if (comptime builtin.os.tag == .windows) return error.SkipZigTest;
    const allocator = std.testing.allocator;

    const previous_nullhub_home = getEnvVarOwnedZ(allocator, "NULLHUB_HOME");
    defer if (previous_nullhub_home) |value| allocator.free(value);
    defer {
        if (previous_nullhub_home) |value| {
            _ = testenv.setenv("NULLHUB_HOME", value.ptr, 1);
        } else {
            _ = testenv.unsetenv("NULLHUB_HOME");
        }
    }

    const temp_dir = try getTempDirOwned(allocator);
    defer allocator.free(temp_dir);
    const expected_root = try std.fmt.allocPrintSentinel(allocator, "{s}/nullhub-home-env-test", .{temp_dir}, 0);
    defer allocator.free(expected_root);

    if (testenv.setenv("NULLHUB_HOME", expected_root.ptr, 1) != 0) return error.Unexpected;

    var p = try Paths.init(allocator, null);
    defer p.deinit(allocator);

    try std.testing.expectEqualStrings(expected_root, p.root);
}

test "init without custom root falls back to HOME" {
    if (comptime builtin.os.tag == .windows) return error.SkipZigTest;
    const allocator = std.testing.allocator;

    const previous_nullhub_home = getEnvVarOwnedZ(allocator, "NULLHUB_HOME");
    defer if (previous_nullhub_home) |value| allocator.free(value);
    defer {
        if (previous_nullhub_home) |value| {
            _ = testenv.setenv("NULLHUB_HOME", value.ptr, 1);
        } else {
            _ = testenv.unsetenv("NULLHUB_HOME");
        }
    }
    _ = testenv.unsetenv("NULLHUB_HOME");

    const home = getHomeDirOwned(allocator) catch return; // skip if no HOME/USERPROFILE
    defer allocator.free(home);
    const expected_root = try std.fs.path.join(allocator, &.{ home, ".nullhub" });
    defer allocator.free(expected_root);

    var p = try Paths.init(allocator, null);
    defer p.deinit(allocator);

    try std.testing.expectEqualStrings(expected_root, p.root);
}

test "getTempDirOwned returns absolute directory" {
    const allocator = std.testing.allocator;
    const path = try getTempDirOwned(allocator);
    defer allocator.free(path);

    try std.testing.expect(std.fs.path.isAbsolute(path));
}

test "uniqueTempPathAlloc uses requested prefix and suffix" {
    const allocator = std.testing.allocator;
    const path = try uniqueTempPathAlloc(allocator, "nullhub-paths-test", ".json");
    defer allocator.free(path);

    try std.testing.expect(std.fs.path.isAbsolute(path));
    try std.testing.expect(std.mem.endsWith(u8, path, ".json"));
    try std.testing.expect(std.mem.indexOf(u8, path, "nullhub-paths-test-") != null);
}
