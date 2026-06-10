const std = @import("std");
const state_mod = @import("../core/state.zig");
const helpers = @import("helpers.zig");
const query = @import("query.zig");
const spaces_api = @import("spaces.zig");

const appendEscaped = helpers.appendEscaped;

const max_limit: usize = 100;
const default_limit: usize = 50;

const EventFilters = struct {
    space_id: []const u8,
    event_type: ?[]const u8 = null,
    source: ?[]const u8 = null,
    subject_type: ?[]const u8 = null,
    subject_id: ?[]const u8 = null,
    severity: ?[]const u8 = null,
};

pub fn isEventsPath(target: []const u8) bool {
    return std.mem.eql(u8, query.stripTarget(target), "/api/events");
}

pub fn handleList(allocator: std.mem.Allocator, state: *state_mod.State, target: []const u8) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    const event_type = query.valueAlloc(allocator, target, "type") catch return helpers.serverError();
    defer if (event_type) |value| allocator.free(value);
    const source = query.valueAlloc(allocator, target, "source") catch return helpers.serverError();
    defer if (source) |value| allocator.free(value);
    const subject_type = query.valueAlloc(allocator, target, "subject_type") catch return helpers.serverError();
    defer if (subject_type) |value| allocator.free(value);
    const subject_id = query.valueAlloc(allocator, target, "subject_id") catch return helpers.serverError();
    defer if (subject_id) |value| allocator.free(value);
    const severity = query.valueAlloc(allocator, target, "severity") catch return helpers.serverError();
    defer if (severity) |value| allocator.free(value);

    const cursor = parseCursor(target) catch return helpers.badRequest("{\"error\":\"invalid cursor\"}");
    const limit = parseLimit(target);

    const body = renderList(allocator, state.eventsList(), .{
        .space_id = space_id,
        .event_type = nonEmpty(event_type),
        .source = nonEmpty(source),
        .subject_type = nonEmpty(subject_type),
        .subject_id = nonEmpty(subject_id),
        .severity = nonEmpty(severity),
    }, cursor, limit) catch return helpers.serverError();
    return helpers.jsonOk(body);
}

pub fn handleCreate(allocator: std.mem.Allocator, state: *state_mod.State, target: []const u8, body: []const u8, now_ms: i64) helpers.ApiResponse {
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

    const event_type = stringField(root, "type") orelse stringField(root, "event_type") orelse
        return helpers.badRequest("{\"error\":\"type is required\"}");
    if (std.mem.trim(u8, event_type, &std.ascii.whitespace).len == 0) {
        return helpers.badRequest("{\"error\":\"type is required\"}");
    }

    const title = stringField(root, "title") orelse event_type;
    const source = stringField(root, "source") orelse "api";
    const subject_type = stringField(root, "subject_type") orelse "";
    const subject_id = stringField(root, "subject_id") orelse "";
    const summary = stringField(root, "summary") orelse "";
    const severity = stringField(root, "severity") orelse "info";
    const evidence_ref = stringField(root, "evidence_ref") orelse "";
    const created_at_ms = if (root.get("created_at_ms")) |value| parseI64(value) orelse now_ms else now_ms;

    const payload_json = if (root.get("payload")) |payload|
        std.json.Stringify.valueAlloc(allocator, payload, .{}) catch return helpers.serverError()
    else
        tryDefaultPayload(allocator) catch return helpers.serverError();
    defer allocator.free(payload_json);

    const event = state.addEvent(.{
        .space_id = space_id,
        .event_type = event_type,
        .source = source,
        .subject_type = subject_type,
        .subject_id = subject_id,
        .title = title,
        .summary = summary,
        .severity = severity,
        .evidence_ref = evidence_ref,
        .payload_json = payload_json,
        .created_at_ms = created_at_ms,
    }) catch return helpers.serverError();

    state.save() catch return helpers.serverError();

    const response = renderEventObject(allocator, event) catch return helpers.serverError();
    return .{ .status = "201 Created", .content_type = "application/json", .body = response };
}

pub fn appendLifecycleStarted(state: *state_mod.State, now_ms: i64) !void {
    _ = try state.addEvent(.{
        .space_id = "default",
        .event_type = "hub.lifecycle.started",
        .source = "nullhub",
        .subject_type = "hub",
        .subject_id = "nullhub",
        .title = "NullHub started",
        .summary = "NullHub server accepted a new runtime session.",
        .severity = "info",
        .payload_json = "{}",
        .created_at_ms = now_ms,
    });
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

fn tryDefaultPayload(allocator: std.mem.Allocator) ![]u8 {
    return allocator.dupe(u8, "{}");
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

fn matches(event: state_mod.Event, filters: EventFilters, cursor: ?u64) bool {
    if (!std.mem.eql(u8, event.space_id, filters.space_id)) return false;
    if (cursor) |value| {
        if (event.id >= value) return false;
    }
    if (filters.event_type) |value| {
        if (!std.mem.eql(u8, event.event_type, value)) return false;
    }
    if (filters.source) |value| {
        if (!std.mem.eql(u8, event.source, value)) return false;
    }
    if (filters.subject_type) |value| {
        if (!std.mem.eql(u8, event.subject_type, value)) return false;
    }
    if (filters.subject_id) |value| {
        if (!std.mem.eql(u8, event.subject_id, value)) return false;
    }
    if (filters.severity) |value| {
        if (!std.mem.eql(u8, event.severity, value)) return false;
    }
    return true;
}

fn renderList(
    allocator: std.mem.Allocator,
    events: []const state_mod.Event,
    filters: EventFilters,
    cursor: ?u64,
    limit: usize,
) ![]const u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();

    try buf.appendSlice("{\"events\":[");
    var appended: usize = 0;
    var last_id: u64 = 0;
    var has_more = false;
    var idx = events.len;
    while (idx > 0) {
        idx -= 1;
        const event = events[idx];
        if (!matches(event, filters, cursor)) continue;
        if (appended >= limit) {
            has_more = true;
            break;
        }
        if (appended > 0) try buf.append(',');
        try appendEventJson(&buf, event);
        last_id = event.id;
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

fn renderEventObject(allocator: std.mem.Allocator, event: state_mod.Event) ![]const u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    try appendEventJson(&buf, event);
    return buf.toOwnedSlice();
}

fn appendEventJson(buf: *std.array_list.Managed(u8), event: state_mod.Event) !void {
    try buf.appendSlice("{\"id\":");
    try appendFmt(buf, "{d}", .{event.id});
    try buf.appendSlice(",\"space_id\":\"");
    try appendEscaped(buf, event.space_id);
    try buf.appendSlice("\",\"type\":\"");
    try appendEscaped(buf, event.event_type);
    try buf.appendSlice("\",\"source\":\"");
    try appendEscaped(buf, event.source);
    try buf.appendSlice("\",\"subject_type\":\"");
    try appendEscaped(buf, event.subject_type);
    try buf.appendSlice("\",\"subject_id\":\"");
    try appendEscaped(buf, event.subject_id);
    try buf.appendSlice("\",\"title\":\"");
    try appendEscaped(buf, event.title);
    try buf.appendSlice("\",\"summary\":\"");
    try appendEscaped(buf, event.summary);
    try buf.appendSlice("\",\"severity\":\"");
    try appendEscaped(buf, event.severity);
    try buf.appendSlice("\",\"evidence_ref\":\"");
    try appendEscaped(buf, event.evidence_ref);
    try buf.appendSlice("\",\"created_at_ms\":");
    try appendFmt(buf, "{d}", .{event.created_at_ms});
    try buf.appendSlice(",\"payload\":");
    try buf.appendSlice(if (event.payload_json.len > 0) event.payload_json else "{}");
    try buf.appendSlice("}");
}

fn appendFmt(buf: *std.array_list.Managed(u8), comptime fmt: []const u8, args: anytype) !void {
    const rendered = try std.fmt.allocPrint(buf.allocator, fmt, args);
    defer buf.allocator.free(rendered);
    try buf.appendSlice(rendered);
}

test "handleCreate appends and handleList filters by space type and cursor" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const path = try fixture.paths.state(allocator);
    defer allocator.free(path);
    var state = state_mod.State.init(allocator, path);
    defer state.deinit();

    const first = handleCreate(
        allocator,
        &state,
        "/api/events?space=ops",
        "{\"type\":\"work.started\",\"source\":\"test\",\"subject_type\":\"run\",\"subject_id\":\"run-1\",\"title\":\"Run started\",\"payload\":{\"ok\":true},\"created_at_ms\":1000}",
        1111,
    );
    defer allocator.free(first.body);
    try std.testing.expectEqualStrings("201 Created", first.status);
    try std.testing.expect(std.mem.indexOf(u8, first.body, "\"id\":1") != null);
    try std.testing.expect(std.mem.indexOf(u8, first.body, "\"payload\":{\"ok\":true}") != null);

    const second = handleCreate(
        allocator,
        &state,
        "/api/events?space=ops",
        "{\"type\":\"work.finished\",\"source\":\"test\",\"subject_type\":\"run\",\"subject_id\":\"run-1\",\"title\":\"Run finished\",\"severity\":\"success\",\"created_at_ms\":1001}",
        1112,
    );
    defer allocator.free(second.body);
    try std.testing.expectEqualStrings("201 Created", second.status);

    const other_space = handleCreate(
        allocator,
        &state,
        "/api/events?space=lab",
        "{\"type\":\"work.started\",\"source\":\"test\",\"title\":\"Lab run\",\"created_at_ms\":1002}",
        1113,
    );
    defer allocator.free(other_space.body);
    try std.testing.expectEqualStrings("201 Created", other_space.status);

    const list = handleList(allocator, &state, "/api/events?space=ops&limit=1");
    defer allocator.free(list.body);
    try std.testing.expectEqualStrings("200 OK", list.status);
    try std.testing.expect(std.mem.indexOf(u8, list.body, "\"type\":\"work.finished\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, list.body, "\"type\":\"work.started\"") == null);
    try std.testing.expect(std.mem.indexOf(u8, list.body, "\"has_more\":true") != null);
    try std.testing.expect(std.mem.indexOf(u8, list.body, "\"next_cursor\":\"2\"") != null);

    const next = handleList(allocator, &state, "/api/events?space=ops&cursor=2&type=work.started");
    defer allocator.free(next.body);
    try std.testing.expectEqualStrings("200 OK", next.status);
    try std.testing.expect(std.mem.indexOf(u8, next.body, "\"id\":1") != null);
    try std.testing.expect(std.mem.indexOf(u8, next.body, "\"id\":3") == null);
}

test "events require query space and reject mismatched body space" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const path = try fixture.paths.state(allocator);
    defer allocator.free(path);
    var state = state_mod.State.init(allocator, path);
    defer state.deinit();

    const missing = handleList(allocator, &state, "/api/events");
    try std.testing.expectEqualStrings("400 Bad Request", missing.status);

    const mismatch = handleCreate(
        allocator,
        &state,
        "/api/events?space=ops",
        "{\"space_id\":\"lab\",\"type\":\"work.started\"}",
        1000,
    );
    try std.testing.expectEqualStrings("400 Bad Request", mismatch.status);
}
