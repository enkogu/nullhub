//! Telegram ping on approval creation (ncm-ie7m).
//!
//! V1 is a plain message with a deep link to /inbox — Telegram inline approval
//! buttons are deferred (docs/specs/product.md#deferrals). The send mirrors the
//! existing NullClaw Telegram channel send (`sendTelegramReply` in
//! apps/nullstack/nullclaw/src/gateway.zig): the same Bot API `sendMessage`
//! call, including the `builtin.is_test` guard so tests never perform live
//! Telegram I/O. The per-space enable flag lives on the space-scoped saved
//! Telegram channel config (`notify_approvals: true`), not a new global.

const std = @import("std");
const builtin = @import("builtin");
const std_compat = @import("compat");
const state_mod = @import("../core/state.zig");

pub const SendFn = *const fn (
    ctx: ?*anyopaque,
    allocator: std.mem.Allocator,
    bot_token: []const u8,
    chat_id: []const u8,
    text: []const u8,
) anyerror!void;

pub const Sender = struct {
    ctx: ?*anyopaque = null,
    send: SendFn = telegramSend,
};

/// Send a Telegram ping for a freshly created approval to every saved
/// Telegram channel in the approval's space that opted in with
/// `notify_approvals: true`. Best-effort: send failures are counted out but
/// never propagate. Returns the number of successful sends.
pub fn notifyApprovalCreated(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    approval: state_mod.Approval,
    base_url: []const u8,
    sender: Sender,
) usize {
    var sent: usize = 0;
    for (state.savedChannels()) |channel| {
        if (!std.mem.eql(u8, channel.channel_type, "telegram")) continue;
        if (!std.mem.eql(u8, channel.space_id, approval.space_id)) continue;
        const target = telegramTargetFromConfig(allocator, channel.config) orelse continue;
        defer target.deinit(allocator);

        const text = buildPingText(allocator, approval, base_url) catch continue;
        defer allocator.free(text);

        sender.send(sender.ctx, allocator, target.bot_token, target.chat_id, text) catch continue;
        sent += 1;
    }
    return sent;
}

const TelegramTarget = struct {
    bot_token: []u8,
    chat_id: []u8,

    fn deinit(self: TelegramTarget, allocator: std.mem.Allocator) void {
        allocator.free(self.bot_token);
        allocator.free(self.chat_id);
    }
};

/// Parse a saved channel config and return the send target only when the
/// space opted in (`notify_approvals: true`) and credentials are present.
fn telegramTargetFromConfig(allocator: std.mem.Allocator, config_json: []const u8) ?TelegramTarget {
    if (config_json.len == 0) return null;
    var tree = std.json.parseFromSlice(std.json.Value, allocator, config_json, .{
        .allocate = .alloc_always,
    }) catch return null;
    defer tree.deinit();

    const root = switch (tree.value) {
        .object => |obj| obj,
        else => return null,
    };

    const enabled = switch (root.get("notify_approvals") orelse return null) {
        .bool => |value| value,
        else => false,
    };
    if (!enabled) return null;

    const bot_token = switch (root.get("bot_token") orelse return null) {
        .string => |value| value,
        else => return null,
    };
    if (bot_token.len == 0) return null;

    const chat_id_value = root.get("chat_id") orelse return null;
    const chat_id = switch (chat_id_value) {
        .string => |value| allocator.dupe(u8, value) catch return null,
        .integer => |value| std.fmt.allocPrint(allocator, "{d}", .{value}) catch return null,
        else => return null,
    };
    errdefer allocator.free(chat_id);
    if (chat_id.len == 0) {
        allocator.free(chat_id);
        return null;
    }

    const owned_token = allocator.dupe(u8, bot_token) catch {
        allocator.free(chat_id);
        return null;
    };
    return .{ .bot_token = owned_token, .chat_id = chat_id };
}

fn buildPingText(allocator: std.mem.Allocator, approval: state_mod.Approval, base_url: []const u8) ![]u8 {
    const trimmed_base = std.mem.trimEnd(u8, base_url, "/");
    return std.fmt.allocPrint(
        allocator,
        "Approval needed: {s}\nDecide in your Inbox: {s}/inbox?space={s}",
        .{ approval.title, trimmed_base, approval.space_id },
    );
}

/// Production sender: the Bot API `sendMessage` call used by the NullClaw
/// Telegram channel. Tests never reach the network (`builtin.is_test` guard,
/// same as nullclaw's sendTelegramReply).
fn telegramSend(
    ctx: ?*anyopaque,
    allocator: std.mem.Allocator,
    bot_token: []const u8,
    chat_id: []const u8,
    text: []const u8,
) anyerror!void {
    _ = ctx;
    const body = try buildSendMessageBody(allocator, chat_id, text);
    defer allocator.free(body);

    if (comptime builtin.is_test) return;

    const url = try std.fmt.allocPrint(allocator, "https://api.telegram.org/bot{s}/sendMessage", .{bot_token});
    defer allocator.free(url);

    var client: std.http.Client = .{ .allocator = allocator, .io = std_compat.io() };
    defer client.deinit();

    var response_body: std.Io.Writer.Allocating = .init(allocator);
    defer response_body.deinit();

    const result = try client.fetch(.{
        .location = .{ .url = url },
        .method = .POST,
        .payload = body,
        .headers = .{ .content_type = .{ .override = "application/json" } },
        .response_writer = &response_body.writer,
    });
    const status_code = @intFromEnum(result.status);
    if (status_code < 200 or status_code >= 300) return error.TelegramSendFailed;
}

fn buildSendMessageBody(allocator: std.mem.Allocator, chat_id: []const u8, text: []const u8) ![]u8 {
    const chat_json = try std.json.Stringify.valueAlloc(allocator, chat_id, .{});
    defer allocator.free(chat_json);
    const text_json = try std.json.Stringify.valueAlloc(allocator, text, .{});
    defer allocator.free(text_json);
    return std.fmt.allocPrint(allocator, "{{\"chat_id\":{s},\"text\":{s}}}", .{ chat_json, text_json });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

pub const TestMockSend = struct {
    calls: std.array_list.Managed([]u8),

    pub fn init(allocator: std.mem.Allocator) TestMockSend {
        return .{ .calls = std.array_list.Managed([]u8).init(allocator) };
    }

    pub fn deinit(self: *TestMockSend) void {
        for (self.calls.items) |call| self.calls.allocator.free(call);
        self.calls.deinit();
    }

    pub fn sender(self: *TestMockSend) Sender {
        return .{ .ctx = self, .send = record };
    }

    fn record(
        ctx: ?*anyopaque,
        allocator: std.mem.Allocator,
        bot_token: []const u8,
        chat_id: []const u8,
        text: []const u8,
    ) anyerror!void {
        _ = allocator;
        const self: *TestMockSend = @ptrCast(@alignCast(ctx.?));
        const rendered = try std.fmt.allocPrint(
            self.calls.allocator,
            "{s}|{s}|{s}",
            .{ bot_token, chat_id, text },
        );
        try self.calls.append(rendered);
    }
};

fn testState(allocator: std.mem.Allocator, fixture: *@import("../test_helpers.zig").TempPaths) !state_mod.State {
    const path = try fixture.paths.state(allocator);
    defer allocator.free(path);
    return state_mod.State.init(allocator, path);
}

test "configured space produces one channel send with the /inbox deep link" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    var state = try testState(allocator, &fixture);
    defer state.deinit();

    try state.addSavedChannel(.{
        .channel_type = "telegram",
        .account = "opsbot",
        .config = "{\"bot_token\":\"123:abc\",\"chat_id\":42,\"notify_approvals\":true}",
        .space_id = "ops",
    });
    // Same space but opted out — must not be pinged.
    try state.addSavedChannel(.{
        .channel_type = "telegram",
        .account = "quietbot",
        .config = "{\"bot_token\":\"456:def\",\"chat_id\":\"7\"}",
        .space_id = "ops",
    });
    // Other space — must not be pinged.
    try state.addSavedChannel(.{
        .channel_type = "telegram",
        .account = "labbot",
        .config = "{\"bot_token\":\"789:ghi\",\"chat_id\":\"9\",\"notify_approvals\":true}",
        .space_id = "lab",
    });

    const approval = try state.addApproval(.{
        .space_id = "ops",
        .kind = "signature",
        .title = "Sign deploy",
        .created_at_ms = 1000,
    });

    var mock = TestMockSend.init(allocator);
    defer mock.deinit();

    const sent = notifyApprovalCreated(allocator, &state, approval, "http://127.0.0.1:19800/", mock.sender());
    try std.testing.expectEqual(@as(usize, 1), sent);
    try std.testing.expectEqual(@as(usize, 1), mock.calls.items.len);
    try std.testing.expectEqualStrings(
        "123:abc|42|Approval needed: Sign deploy\nDecide in your Inbox: http://127.0.0.1:19800/inbox?space=ops",
        mock.calls.items[0],
    );
}

test "space without an opted-in telegram channel produces no sends" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    var state = try testState(allocator, &fixture);
    defer state.deinit();

    try state.addSavedChannel(.{
        .channel_type = "discord",
        .account = "opsdiscord",
        .config = "{\"bot_token\":\"x\",\"chat_id\":\"1\",\"notify_approvals\":true}",
        .space_id = "ops",
    });

    const approval = try state.addApproval(.{
        .space_id = "ops",
        .kind = "failure",
        .title = "Run failed",
        .created_at_ms = 1000,
    });

    var mock = TestMockSend.init(allocator);
    defer mock.deinit();

    const sent = notifyApprovalCreated(allocator, &state, approval, "http://127.0.0.1:19800", mock.sender());
    try std.testing.expectEqual(@as(usize, 0), sent);
    try std.testing.expectEqual(@as(usize, 0), mock.calls.items.len);
}

test "telegramSend builds a body and is a no-op under test" {
    // Exercises the production sender path: under `builtin.is_test` it must
    // return after body construction without any network I/O.
    try telegramSend(null, std.testing.allocator, "123:abc", "42", "hello");
}

test "buildSendMessageBody escapes JSON text" {
    const body = try buildSendMessageBody(std.testing.allocator, "42", "line \"one\"\ntwo");
    defer std.testing.allocator.free(body);
    try std.testing.expectEqualStrings("{\"chat_id\":\"42\",\"text\":\"line \\\"one\\\"\\ntwo\"}", body);
}
