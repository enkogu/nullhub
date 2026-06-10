const std = @import("std");
const builtin = @import("builtin");
const std_compat = @import("compat");

/// Exclusive-instance guard backed by an OS file lock on `{root}/nullhub.pid`.
///
/// Two hub processes serving the same state directory (and therefore the same
/// port) is the worst failure mode we know: each embeds its own UI generation
/// and holds separate in-memory supervisor state, so reloads alternate between
/// incompatible builds. The lock is released automatically by the OS when the
/// process exits in any way, so a crash can never leave a stale guard behind.
pub const pidfile_name = "nullhub.pid";

pub const Guard = struct {
    file: std_compat.fs.File,

    pub fn release(self: *Guard) void {
        self.file.close();
        self.* = undefined;
    }
};

/// Acquire the single-instance lock for the given nullhub root directory.
/// Returns `error.AlreadyRunning` when another live process holds it.
/// On platforms without file locks the guard is a best-effort no-op.
pub fn acquire(allocator: std.mem.Allocator, root: []const u8) !Guard {
    const pidfile_path = try std.fs.path.join(allocator, &.{ root, pidfile_name });
    defer allocator.free(pidfile_path);

    const file = try std_compat.fs.createFileAbsolute(pidfile_path, .{ .truncate = false, .read = true });
    errdefer file.close();

    const locked = file.toInner().tryLock(std_compat.io(), .exclusive) catch |err| switch (err) {
        // No lock support (e.g. exotic filesystems): proceed unguarded
        // rather than refusing to start.
        error.FileLocksUnsupported => true,
        else => return err,
    };
    if (!locked) return error.AlreadyRunning;

    writePidfile(pidfile_path) catch {};
    return .{ .file = file };
}

/// Best-effort pid of the current lock holder, for error messages only —
/// the flock, not the file content, is the authority.
pub fn holderPid(allocator: std.mem.Allocator, root: []const u8) ?u64 {
    const pidfile_path = std.fs.path.join(allocator, &.{ root, pidfile_name }) catch return null;
    defer allocator.free(pidfile_path);

    const file = std_compat.fs.openFileAbsolute(pidfile_path, .{}) catch return null;
    defer file.close();

    var buf: [32]u8 = undefined;
    const n = file.readAll(&buf) catch return null;
    const text = std.mem.trim(u8, buf[0..n], " \t\r\n");
    return std.fmt.parseInt(u64, text, 10) catch null;
}

/// Rewrite the pidfile content with our pid. Uses a second fd on the same
/// path so the locked fd stays untouched; the lock is per file, not per fd.
fn writePidfile(pidfile_path: []const u8) !void {
    const file = try std_compat.fs.createFileAbsolute(pidfile_path, .{ .truncate = true });
    defer file.close();

    var buf: [32]u8 = undefined;
    const text = try std.fmt.bufPrint(&buf, "{d}\n", .{currentProcessId()});
    try file.writeAll(text);
}

fn currentProcessId() u64 {
    return switch (builtin.os.tag) {
        .linux => @intCast(std.os.linux.getpid()),
        .macos => @intCast(std.c.getpid()),
        .windows => std.os.windows.GetCurrentProcessId(),
        else => 0,
    };
}

test "acquire blocks a second guard until released" {
    if (builtin.os.tag == .wasi) return error.SkipZigTest;

    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    const root = try std_compat.fs.Dir.wrap(tmp.dir).realpathAlloc(std.testing.allocator, ".");
    defer std.testing.allocator.free(root);

    var guard = try acquire(std.testing.allocator, root);
    try std.testing.expectError(error.AlreadyRunning, acquire(std.testing.allocator, root));

    guard.release();
    var second = try acquire(std.testing.allocator, root);
    second.release();
}

test "holderPid reads the recorded pid" {
    if (builtin.os.tag == .wasi) return error.SkipZigTest;

    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    const root = try std_compat.fs.Dir.wrap(tmp.dir).realpathAlloc(std.testing.allocator, ".");
    defer std.testing.allocator.free(root);

    var guard = try acquire(std.testing.allocator, root);
    defer guard.release();

    const pid = holderPid(std.testing.allocator, root) orelse return error.TestUnexpectedResult;
    try std.testing.expectEqual(currentProcessId(), pid);
}
