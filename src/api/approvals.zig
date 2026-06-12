const std = @import("std");
const state_mod = @import("../core/state.zig");
const helpers = @import("helpers.zig");
const query = @import("query.zig");
const spaces_api = @import("spaces.zig");
const approval_notify = @import("approval_notify.zig");

const appendEscaped = helpers.appendEscaped;

const max_limit: usize = 100;
const default_limit: usize = 50;

const ApprovalFilters = struct {
    space_id: []const u8,
    status: ?[]const u8 = null,
    kind: ?[]const u8 = null,
    queue: ?[]const u8 = null,
};

pub fn isApprovalsPath(target: []const u8) bool {
    return std.mem.eql(u8, query.stripTarget(target), "/api/approvals");
}

/// Match `/api/approvals/{id}/decide` and return the approval id.
pub fn decideIdFromTarget(target: []const u8) ?u64 {
    const clean = query.stripTarget(target);
    const prefix = "/api/approvals/";
    if (!std.mem.startsWith(u8, clean, prefix)) return null;
    const rest = clean[prefix.len..];
    const sep = std.mem.indexOfScalar(u8, rest, '/') orelse return null;
    if (!std.mem.eql(u8, rest[sep + 1 ..], "decide")) return null;
    return std.fmt.parseInt(u64, rest[0..sep], 10) catch null;
}

pub fn handleList(allocator: std.mem.Allocator, state: *state_mod.State, target: []const u8) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    const status = query.valueAlloc(allocator, target, "status") catch return helpers.serverError();
    defer if (status) |value| allocator.free(value);
    const kind = query.valueAlloc(allocator, target, "kind") catch return helpers.serverError();
    defer if (kind) |value| allocator.free(value);
    const queue = query.valueAlloc(allocator, target, "queue") catch return helpers.serverError();
    defer if (queue) |value| allocator.free(value);

    const cursor = parseCursor(target) catch return helpers.badRequest("{\"error\":\"invalid cursor\"}");
    const limit = parseLimit(target);

    const body = renderList(allocator, state.approvalsList(), .{
        .space_id = space_id,
        .status = nonEmpty(status),
        .kind = nonEmpty(kind),
        .queue = nonEmpty(queue),
    }, cursor, limit) catch return helpers.serverError();
    return helpers.jsonOk(body);
}

pub const CreateOptions = struct {
    /// Base URL used for the Telegram deep link to /inbox (e.g. "http://127.0.0.1:19800").
    base_url: []const u8 = "",
    notify_sender: approval_notify.Sender = .{},
};

pub const ProducerApprovalInput = struct {
    space_id: []const u8,
    kind: []const u8 = "signature",
    queue: []const u8 = "",
    target_ref: []const u8 = "",
    title: []const u8,
    summary: []const u8 = "",
    created_at_ms: i64,
};

pub fn createProducerApproval(state: *state_mod.State, input: ProducerApprovalInput, now_ms: i64) !state_mod.Approval {
    if (!isValidKind(input.kind)) return error.InvalidApprovalKind;
    const approval = try state.addApproval(.{
        .space_id = input.space_id,
        .kind = input.kind,
        .queue = input.queue,
        .target_ref = input.target_ref,
        .title = input.title,
        .summary = input.summary,
        .created_at_ms = input.created_at_ms,
    });
    try appendApprovalEvent(state, approval, "approval.created", "Approval created", now_ms);
    try state.save();
    return approval;
}

pub fn handleCreate(allocator: std.mem.Allocator, state: *state_mod.State, target: []const u8, body: []const u8, now_ms: i64, options: CreateOptions) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    var tree = std.json.parseFromSlice(std.json.Value, allocator, body, .{
        .allocate = .alloc_always,
    }) catch return helpers.badRequest("{\"error\":\"invalid JSON body\"}");
    defer tree.deinit();

    const root = switch (tree.value) {
        .object => |obj| obj,
        else => return helpers.badRequest("{\"error\":\"invalid JSON body\"}"),
    };

    if (stringField(root, "space_id") orelse stringField(root, "space")) |body_space| {
        if (body_space.len > 0 and !std.mem.eql(u8, body_space, space_id)) {
            return helpers.badRequest("{\"error\":\"body space must match query space\"}");
        }
    }

    const kind = stringField(root, "kind") orelse
        return helpers.badRequest("{\"error\":\"kind is required\"}");
    if (!isValidKind(kind)) {
        return helpers.badRequest("{\"error\":\"kind must be signature, question, or failure\"}");
    }

    const title = stringField(root, "title") orelse
        return helpers.badRequest("{\"error\":\"title is required\"}");
    if (std.mem.trim(u8, title, &std.ascii.whitespace).len == 0) {
        return helpers.badRequest("{\"error\":\"title is required\"}");
    }

    const queue = stringField(root, "queue") orelse "";
    const target_ref = stringField(root, "target_ref") orelse "";
    const summary = stringField(root, "summary") orelse "";
    const created_at_ms = if (root.get("created_at_ms")) |value| parseI64(value) orelse now_ms else now_ms;

    const approval = createProducerApproval(state, .{
        .space_id = space_id,
        .kind = kind,
        .queue = queue,
        .target_ref = target_ref,
        .title = title,
        .summary = summary,
        .created_at_ms = created_at_ms,
    }, now_ms) catch return helpers.serverError();

    // Best-effort Telegram ping (ncm-ie7m): never fails the create request.
    _ = approval_notify.notifyApprovalCreated(allocator, state, approval, options.base_url, options.notify_sender);

    const response = renderApprovalObject(allocator, approval) catch return helpers.serverError();
    return .{ .status = "201 Created", .content_type = "application/json", .body = response };
}

pub fn handleDecide(allocator: std.mem.Allocator, state: *state_mod.State, target: []const u8, id: u64, body: []const u8, now_ms: i64) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    var tree = std.json.parseFromSlice(std.json.Value, allocator, body, .{
        .allocate = .alloc_always,
    }) catch return helpers.badRequest("{\"error\":\"invalid JSON body\"}");
    defer tree.deinit();

    const root = switch (tree.value) {
        .object => |obj| obj,
        else => return helpers.badRequest("{\"error\":\"invalid JSON body\"}"),
    };

    const decision = stringField(root, "decision") orelse
        return helpers.badRequest("{\"error\":\"decision is required\"}");
    const feedback = stringField(root, "feedback") orelse "";

    // Space-scoped read: an approval in another space is not visible here.
    const existing = state.getApproval(id) orelse return helpers.notFound();
    if (!std.mem.eql(u8, existing.space_id, space_id)) return helpers.notFound();

    const approval = state.decideApproval(id, decision, feedback, now_ms) catch |err| switch (err) {
        error.ApprovalNotFound => return helpers.notFound(),
        error.InvalidDecision => return helpers.badRequest("{\"error\":\"decision must be approved, pushed_back, or rejected\"}"),
        error.FeedbackRequired => return .{
            .status = "422 Unprocessable Entity",
            .content_type = "application/json",
            .body = "{\"error\":\"feedback is required when pushing back\"}",
        },
        error.AlreadyDecided => return .{
            .status = "409 Conflict",
            .content_type = "application/json",
            .body = "{\"error\":\"approval already decided\"}",
        },
        else => return helpers.serverError(),
    };

    const event_type = if (std.mem.eql(u8, decision, "approved"))
        "approval.approved"
    else if (std.mem.eql(u8, decision, "pushed_back"))
        "approval.pushed_back"
    else
        "approval.rejected";
    appendApprovalEvent(state, approval, event_type, "Approval decided", now_ms) catch
        return helpers.serverError();

    state.save() catch return helpers.serverError();

    const response = renderApprovalObject(allocator, approval) catch return helpers.serverError();
    return helpers.jsonOk(response);
}

fn appendApprovalEvent(
    state: *state_mod.State,
    approval: state_mod.Approval,
    event_type: []const u8,
    summary: []const u8,
    now_ms: i64,
) !void {
    var id_buf: [20]u8 = undefined;
    const subject_id = std.fmt.bufPrint(&id_buf, "{d}", .{approval.id}) catch unreachable;
    _ = try state.addEvent(.{
        .space_id = approval.space_id,
        .event_type = event_type,
        .source = "nullhub",
        .subject_type = "approval",
        .subject_id = subject_id,
        .title = approval.title,
        .summary = summary,
        .severity = "info",
        .payload_json = "{}",
        .created_at_ms = now_ms,
    });
}

fn isValidKind(kind: []const u8) bool {
    return std.mem.eql(u8, kind, "signature") or
        std.mem.eql(u8, kind, "question") or
        std.mem.eql(u8, kind, "failure");
}

fn requiredSpaceQueryAlloc(allocator: std.mem.Allocator, target: []const u8) ![]u8 {
    const space_id = (try spaces_api.spaceQueryAlloc(allocator, target)) orelse return error.MissingSpace;
    errdefer allocator.free(space_id);
    if (!spaces_api.isValidSpaceId(space_id)) return error.InvalidSpace;
    return space_id;
}

fn nonEmpty(value: ?[]const u8) ?[]const u8 {
    const raw = value orelse return null;
    if (raw.len == 0) return null;
    return raw;
}

fn stringField(root: std.json.ObjectMap, key: []const u8) ?[]const u8 {
    return switch (root.get(key) orelse return null) {
        .string => |value| value,
        else => null,
    };
}

fn parseI64(value: std.json.Value) ?i64 {
    return switch (value) {
        .integer => @intCast(value.integer),
        else => null,
    };
}

fn parseCursor(target: []const u8) !?u64 {
    const raw = query.valueRaw(target, "cursor") orelse return null;
    if (raw.len == 0) return null;
    return std.fmt.parseInt(u64, raw, 10) catch error.InvalidCursor;
}

fn parseLimit(target: []const u8) usize {
    const raw = query.usizeValue(target, "limit", default_limit);
    if (raw == 0) return 1;
    return @min(raw, max_limit);
}

fn matches(approval: state_mod.Approval, filters: ApprovalFilters, cursor: ?u64) bool {
    if (!std.mem.eql(u8, approval.space_id, filters.space_id)) return false;
    if (cursor) |value| {
        if (approval.id >= value) return false;
    }
    if (filters.status) |value| {
        if (!std.mem.eql(u8, approval.status, value)) return false;
    }
    if (filters.kind) |value| {
        if (!std.mem.eql(u8, approval.kind, value)) return false;
    }
    if (filters.queue) |value| {
        if (!std.mem.eql(u8, approval.queue, value)) return false;
    }
    return true;
}

fn renderList(
    allocator: std.mem.Allocator,
    approvals: []const state_mod.Approval,
    filters: ApprovalFilters,
    cursor: ?u64,
    limit: usize,
) ![]const u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();

    try buf.appendSlice("{\"approvals\":[");
    var appended: usize = 0;
    var last_id: u64 = 0;
    var has_more = false;
    var idx = approvals.len;
    while (idx > 0) {
        idx -= 1;
        const approval = approvals[idx];
        if (!matches(approval, filters, cursor)) continue;
        if (appended >= limit) {
            has_more = true;
            break;
        }
        if (appended > 0) try buf.append(',');
        try appendApprovalJson(&buf, approval);
        last_id = approval.id;
        appended += 1;
    }
    try buf.appendSlice("],\"has_more\":");
    try buf.appendSlice(if (has_more) "true" else "false");
    try buf.appendSlice(",\"next_cursor\":");
    if (has_more) {
        try appendFmt(&buf, "\"{d}\"", .{last_id});
    } else {
        try buf.appendSlice("null");
    }
    try buf.appendSlice("}");
    return buf.toOwnedSlice();
}

fn renderApprovalObject(allocator: std.mem.Allocator, approval: state_mod.Approval) ![]const u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    try appendApprovalJson(&buf, approval);
    return buf.toOwnedSlice();
}

fn appendApprovalJson(buf: *std.array_list.Managed(u8), approval: state_mod.Approval) !void {
    try buf.appendSlice("{\"id\":");
    try appendFmt(buf, "{d}", .{approval.id});
    try buf.appendSlice(",\"space_id\":\"");
    try appendEscaped(buf, approval.space_id);
    try buf.appendSlice("\",\"kind\":\"");
    try appendEscaped(buf, approval.kind);
    try buf.appendSlice("\",\"queue\":\"");
    try appendEscaped(buf, approval.queue);
    try buf.appendSlice("\",\"target_ref\":\"");
    try appendEscaped(buf, approval.target_ref);
    try buf.appendSlice("\",\"title\":\"");
    try appendEscaped(buf, approval.title);
    try buf.appendSlice("\",\"summary\":\"");
    try appendEscaped(buf, approval.summary);
    try buf.appendSlice("\",\"status\":\"");
    try appendEscaped(buf, approval.status);
    try buf.appendSlice("\",\"feedback\":\"");
    try appendEscaped(buf, approval.feedback);
    try buf.appendSlice("\",\"created_at_ms\":");
    try appendFmt(buf, "{d}", .{approval.created_at_ms});
    try buf.appendSlice(",\"decided_at_ms\":");
    try appendFmt(buf, "{d}", .{approval.decided_at_ms});
    try buf.appendSlice("}");
}

fn appendFmt(buf: *std.array_list.Managed(u8), comptime fmt: []const u8, args: anytype) !void {
    const rendered = try std.fmt.allocPrint(buf.allocator, fmt, args);
    defer buf.allocator.free(rendered);
    try buf.appendSlice(rendered);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const TestState = struct {
    fixture: @import("../test_helpers.zig").TempPaths,
    state: state_mod.State,

    fn init(allocator: std.mem.Allocator) !TestState {
        var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
        errdefer fixture.deinit();
        const path = try fixture.paths.state(allocator);
        defer allocator.free(path);
        return .{
            .fixture = fixture,
            .state = state_mod.State.init(allocator, path),
        };
    }

    fn deinit(self: *TestState) void {
        self.state.deinit();
        self.fixture.deinit();
    }
};

test "decideIdFromTarget parses decide paths" {
    try std.testing.expectEqual(@as(?u64, 7), decideIdFromTarget("/api/approvals/7/decide"));
    try std.testing.expectEqual(@as(?u64, 7), decideIdFromTarget("/api/approvals/7/decide?space=ops"));
    try std.testing.expectEqual(@as(?u64, null), decideIdFromTarget("/api/approvals/7"));
    try std.testing.expectEqual(@as(?u64, null), decideIdFromTarget("/api/approvals/abc/decide"));
    try std.testing.expectEqual(@as(?u64, null), decideIdFromTarget("/api/approvals/7/other"));
}

test "handleCreate validates kind and title and emits approval.created" {
    const allocator = std.testing.allocator;
    var ctx = try TestState.init(allocator);
    defer ctx.deinit();

    const missing_kind = handleCreate(allocator, &ctx.state, "/api/approvals?space=ops", "{\"title\":\"Sign this\"}", 1000, .{});
    try std.testing.expectEqualStrings("400 Bad Request", missing_kind.status);

    const bad_kind = handleCreate(allocator, &ctx.state, "/api/approvals?space=ops", "{\"kind\":\"other\",\"title\":\"Sign this\"}", 1000, .{});
    try std.testing.expectEqualStrings("400 Bad Request", bad_kind.status);

    const missing_title = handleCreate(allocator, &ctx.state, "/api/approvals?space=ops", "{\"kind\":\"signature\"}", 1000, .{});
    try std.testing.expectEqualStrings("400 Bad Request", missing_title.status);

    const created = handleCreate(
        allocator,
        &ctx.state,
        "/api/approvals?space=ops",
        "{\"kind\":\"signature\",\"queue\":\"deploys\",\"target_ref\":\"order:42\",\"title\":\"Sign deploy\",\"summary\":\"Deploy v2\",\"created_at_ms\":1000}",
        1111,
        .{},
    );
    defer allocator.free(created.body);
    try std.testing.expectEqualStrings("201 Created", created.status);
    try std.testing.expect(std.mem.indexOf(u8, created.body, "\"status\":\"pending\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, created.body, "\"queue\":\"deploys\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, created.body, "\"target_ref\":\"order:42\"") != null);

    const events = ctx.state.eventsList();
    try std.testing.expectEqual(@as(usize, 1), events.len);
    try std.testing.expectEqualStrings("approval.created", events[0].event_type);
    try std.testing.expectEqualStrings("approval", events[0].subject_type);
    try std.testing.expectEqualStrings("1", events[0].subject_id);
    try std.testing.expectEqualStrings("ops", events[0].space_id);
}

test "handleCreate pings an opted-in telegram channel with the /inbox deep link" {
    const allocator = std.testing.allocator;
    var ctx = try TestState.init(allocator);
    defer ctx.deinit();

    try ctx.state.addSavedChannel(.{
        .channel_type = "telegram",
        .account = "opsbot",
        .config = "{\"bot_token\":\"123:abc\",\"chat_id\":\"42\",\"notify_approvals\":true}",
        .space_id = "ops",
    });

    var mock = approval_notify.TestMockSend.init(allocator);
    defer mock.deinit();

    const created = handleCreate(
        allocator,
        &ctx.state,
        "/api/approvals?space=ops",
        "{\"kind\":\"signature\",\"title\":\"Sign deploy\"}",
        1000,
        .{ .base_url = "http://127.0.0.1:19800", .notify_sender = mock.sender() },
    );
    defer allocator.free(created.body);
    try std.testing.expectEqualStrings("201 Created", created.status);
    try std.testing.expectEqual(@as(usize, 1), mock.calls.items.len);
    try std.testing.expect(std.mem.indexOf(u8, mock.calls.items[0], "http://127.0.0.1:19800/inbox?space=ops") != null);
}

test "handleList is space scoped and filters by status kind and queue" {
    const allocator = std.testing.allocator;
    var ctx = try TestState.init(allocator);
    defer ctx.deinit();

    const first = handleCreate(allocator, &ctx.state, "/api/approvals?space=ops", "{\"kind\":\"signature\",\"queue\":\"deploys\",\"title\":\"Sign deploy\"}", 1000, .{});
    defer allocator.free(first.body);
    const second = handleCreate(allocator, &ctx.state, "/api/approvals?space=ops", "{\"kind\":\"question\",\"queue\":\"intake\",\"title\":\"Pick a color\"}", 1001, .{});
    defer allocator.free(second.body);
    const other = handleCreate(allocator, &ctx.state, "/api/approvals?space=lab", "{\"kind\":\"failure\",\"title\":\"Run failed\"}", 1002, .{});
    defer allocator.free(other.body);

    const missing = handleList(allocator, &ctx.state, "/api/approvals");
    try std.testing.expectEqualStrings("400 Bad Request", missing.status);

    const ops = handleList(allocator, &ctx.state, "/api/approvals?space=ops");
    defer allocator.free(ops.body);
    try std.testing.expectEqualStrings("200 OK", ops.status);
    try std.testing.expect(std.mem.indexOf(u8, ops.body, "Sign deploy") != null);
    try std.testing.expect(std.mem.indexOf(u8, ops.body, "Pick a color") != null);
    try std.testing.expect(std.mem.indexOf(u8, ops.body, "Run failed") == null);

    const filtered = handleList(allocator, &ctx.state, "/api/approvals?space=ops&kind=question&queue=intake&status=pending");
    defer allocator.free(filtered.body);
    try std.testing.expect(std.mem.indexOf(u8, filtered.body, "Pick a color") != null);
    try std.testing.expect(std.mem.indexOf(u8, filtered.body, "Sign deploy") == null);

    const paged = handleList(allocator, &ctx.state, "/api/approvals?space=ops&limit=1");
    defer allocator.free(paged.body);
    try std.testing.expect(std.mem.indexOf(u8, paged.body, "\"has_more\":true") != null);
    try std.testing.expect(std.mem.indexOf(u8, paged.body, "\"next_cursor\":\"2\"") != null);

    const cursored = handleList(allocator, &ctx.state, "/api/approvals?space=ops&cursor=2");
    defer allocator.free(cursored.body);
    try std.testing.expect(std.mem.indexOf(u8, cursored.body, "Sign deploy") != null);
    try std.testing.expect(std.mem.indexOf(u8, cursored.body, "Pick a color") == null);
}

test "handleDecide enforces transitions feedback and space scoping" {
    const allocator = std.testing.allocator;
    var ctx = try TestState.init(allocator);
    defer ctx.deinit();

    const created = handleCreate(allocator, &ctx.state, "/api/approvals?space=ops", "{\"kind\":\"signature\",\"title\":\"Sign deploy\"}", 1000, .{});
    defer allocator.free(created.body);
    try std.testing.expectEqualStrings("201 Created", created.status);

    // Wrong space cannot see the approval.
    const wrong_space = handleDecide(allocator, &ctx.state, "/api/approvals/1/decide?space=lab", 1, "{\"decision\":\"approved\"}", 2000);
    try std.testing.expectEqualStrings("404 Not Found", wrong_space.status);

    // Unknown decision is rejected.
    const bad_decision = handleDecide(allocator, &ctx.state, "/api/approvals/1/decide?space=ops", 1, "{\"decision\":\"maybe\"}", 2000);
    try std.testing.expectEqualStrings("400 Bad Request", bad_decision.status);

    // pushed_back without feedback is rejected.
    const no_feedback = handleDecide(allocator, &ctx.state, "/api/approvals/1/decide?space=ops", 1, "{\"decision\":\"pushed_back\"}", 2000);
    try std.testing.expectEqualStrings("422 Unprocessable Entity", no_feedback.status);

    const blank_feedback = handleDecide(allocator, &ctx.state, "/api/approvals/1/decide?space=ops", 1, "{\"decision\":\"pushed_back\",\"feedback\":\"   \"}", 2000);
    try std.testing.expectEqualStrings("422 Unprocessable Entity", blank_feedback.status);

    // pushed_back with feedback succeeds and emits approval.pushed_back.
    const pushed = handleDecide(allocator, &ctx.state, "/api/approvals/1/decide?space=ops", 1, "{\"decision\":\"pushed_back\",\"feedback\":\"Needs a rollback plan\"}", 2001);
    defer allocator.free(pushed.body);
    try std.testing.expectEqualStrings("200 OK", pushed.status);
    try std.testing.expect(std.mem.indexOf(u8, pushed.body, "\"status\":\"pushed_back\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, pushed.body, "\"feedback\":\"Needs a rollback plan\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, pushed.body, "\"decided_at_ms\":2001") != null);

    const events = ctx.state.eventsList();
    try std.testing.expectEqual(@as(usize, 2), events.len);
    try std.testing.expectEqualStrings("approval.pushed_back", events[1].event_type);

    // Decided approvals are immutable: second decide conflicts.
    const again = handleDecide(allocator, &ctx.state, "/api/approvals/1/decide?space=ops", 1, "{\"decision\":\"approved\"}", 2002);
    try std.testing.expectEqualStrings("409 Conflict", again.status);

    // Unknown id is not found.
    const missing = handleDecide(allocator, &ctx.state, "/api/approvals/99/decide?space=ops", 99, "{\"decision\":\"approved\"}", 2003);
    try std.testing.expectEqualStrings("404 Not Found", missing.status);
}

test "approve and reject transitions emit matching events" {
    const allocator = std.testing.allocator;
    var ctx = try TestState.init(allocator);
    defer ctx.deinit();

    const a = handleCreate(allocator, &ctx.state, "/api/approvals?space=ops", "{\"kind\":\"question\",\"title\":\"Pick a color\"}", 1000, .{});
    defer allocator.free(a.body);
    const b = handleCreate(allocator, &ctx.state, "/api/approvals?space=ops", "{\"kind\":\"failure\",\"title\":\"Run failed\"}", 1001, .{});
    defer allocator.free(b.body);

    const approved = handleDecide(allocator, &ctx.state, "/api/approvals/1/decide?space=ops", 1, "{\"decision\":\"approved\"}", 2000);
    defer allocator.free(approved.body);
    try std.testing.expectEqualStrings("200 OK", approved.status);
    try std.testing.expect(std.mem.indexOf(u8, approved.body, "\"status\":\"approved\"") != null);

    const rejected = handleDecide(allocator, &ctx.state, "/api/approvals/2/decide?space=ops", 2, "{\"decision\":\"rejected\",\"feedback\":\"Duplicate\"}", 2001);
    defer allocator.free(rejected.body);
    try std.testing.expectEqualStrings("200 OK", rejected.status);
    try std.testing.expect(std.mem.indexOf(u8, rejected.body, "\"status\":\"rejected\"") != null);

    const events = ctx.state.eventsList();
    try std.testing.expectEqual(@as(usize, 4), events.len);
    try std.testing.expectEqualStrings("approval.approved", events[2].event_type);
    try std.testing.expectEqualStrings("approval.rejected", events[3].event_type);
}

test "approvals persist across save and load" {
    const allocator = std.testing.allocator;
    var ctx = try TestState.init(allocator);
    defer ctx.deinit();

    const created = handleCreate(allocator, &ctx.state, "/api/approvals?space=ops", "{\"kind\":\"signature\",\"title\":\"Sign deploy\"}", 1000, .{});
    defer allocator.free(created.body);
    const decided = handleDecide(allocator, &ctx.state, "/api/approvals/1/decide?space=ops", 1, "{\"decision\":\"approved\"}", 2000);
    defer allocator.free(decided.body);

    var reloaded = try state_mod.State.load(allocator, ctx.state.path);
    defer reloaded.deinit();
    const approvals = reloaded.approvalsList();
    try std.testing.expectEqual(@as(usize, 1), approvals.len);
    try std.testing.expectEqualStrings("approved", approvals[0].status);
    try std.testing.expectEqualStrings("signature", approvals[0].kind);
    try std.testing.expectEqual(@as(i64, 2000), approvals[0].decided_at_ms);
}
