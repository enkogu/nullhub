const std = @import("std");
const state_mod = @import("../core/state.zig");
const helpers = @import("helpers.zig");
const query = @import("query.zig");

const appendEscaped = helpers.appendEscaped;

pub fn isSpacesPath(target: []const u8) bool {
    const clean = query.stripTarget(target);
    return std.mem.eql(u8, clean, "/api/spaces") or
        std.mem.startsWith(u8, clean, "/api/spaces/");
}

pub fn extractSpaceIdAlloc(allocator: std.mem.Allocator, target: []const u8) !?[]u8 {
    const clean = query.stripTarget(target);
    const prefix = "/api/spaces/";
    if (!std.mem.startsWith(u8, clean, prefix)) return null;
    const rest = clean[prefix.len..];
    if (rest.len == 0 or std.mem.indexOfScalar(u8, rest, '/') != null) return null;
    const decoded = try query.decodePathSegmentAlloc(allocator, rest);
    return decoded;
}

pub fn spaceQueryAlloc(allocator: std.mem.Allocator, target: []const u8) !?[]u8 {
    const value = (try query.valueAlloc(allocator, target, "space")) orelse return null;
    if (value.len == 0) {
        allocator.free(value);
        return null;
    }
    return value;
}

pub fn isValidSpaceId(id: []const u8) bool {
    if (id.len == 0 or id.len > 80) return false;
    for (id) |byte| {
        if ((byte >= 'a' and byte <= 'z') or
            (byte >= 'A' and byte <= 'Z') or
            (byte >= '0' and byte <= '9') or
            byte == '-' or byte == '_' or byte == '.')
        {
            continue;
        }
        return false;
    }
    return true;
}

pub fn handleList(allocator: std.mem.Allocator, state: *state_mod.State) ![]const u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();

    try buf.appendSlice("{\"spaces\":[");
    for (state.spacesList(), 0..) |space, idx| {
        if (idx > 0) try buf.append(',');
        try appendSpaceJson(&buf, space);
    }
    try buf.appendSlice("]}");
    return buf.toOwnedSlice();
}

pub fn handleCreate(allocator: std.mem.Allocator, state: *state_mod.State, body: []const u8) ![]const u8 {
    const parsed = std.json.parseFromSlice(struct {
        id: ?[]const u8 = null,
        name: []const u8,
        kind: []const u8 = "workspace",
        stage: []const u8 = "active",
    }, allocator, body, .{
        .allocate = .alloc_always,
        .ignore_unknown_fields = true,
    }) catch return try allocator.dupe(u8, "{\"error\":\"invalid JSON body\"}");
    defer parsed.deinit();

    const name = std.mem.trim(u8, parsed.value.name, &std.ascii.whitespace);
    if (name.len == 0) return try allocator.dupe(u8, "{\"error\":\"name is required\"}");

    const explicit_id = if (parsed.value.id) |raw| std.mem.trim(u8, raw, &std.ascii.whitespace) else "";
    if (explicit_id.len > 0 and !isValidSpaceId(explicit_id)) {
        return try allocator.dupe(u8, "{\"error\":\"invalid space id\"}");
    }
    if (explicit_id.len > 0 and state.getSpace(explicit_id) != null) {
        return try allocator.dupe(u8, "{\"error\":\"space already exists\"}");
    }

    const kind = std.mem.trim(u8, parsed.value.kind, &std.ascii.whitespace);
    const stage = std.mem.trim(u8, parsed.value.stage, &std.ascii.whitespace);
    const space = try state.addSpace(.{
        .id = explicit_id,
        .name = name,
        .kind = if (kind.len > 0) kind else "workspace",
        .stage = if (stage.len > 0) stage else "active",
    });
    try state.save();

    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    try appendSpaceJson(&buf, space);
    return buf.toOwnedSlice();
}

pub fn handleUpdate(allocator: std.mem.Allocator, state: *state_mod.State, id: []const u8, body: []const u8) ![]const u8 {
    if (!isValidSpaceId(id)) return try allocator.dupe(u8, "{\"error\":\"invalid space id\"}");

    const parsed = std.json.parseFromSlice(struct {
        name: ?[]const u8 = null,
        kind: ?[]const u8 = null,
        stage: ?[]const u8 = null,
    }, allocator, body, .{
        .allocate = .alloc_always,
        .ignore_unknown_fields = true,
    }) catch return try allocator.dupe(u8, "{\"error\":\"invalid JSON body\"}");
    defer parsed.deinit();

    const name = if (parsed.value.name) |value| std.mem.trim(u8, value, &std.ascii.whitespace) else null;
    const kind = if (parsed.value.kind) |value| std.mem.trim(u8, value, &std.ascii.whitespace) else null;
    const stage = if (parsed.value.stage) |value| std.mem.trim(u8, value, &std.ascii.whitespace) else null;
    if (name != null and name.?.len == 0) return try allocator.dupe(u8, "{\"error\":\"name is required\"}");
    if (kind != null and kind.?.len == 0) return try allocator.dupe(u8, "{\"error\":\"kind is required\"}");
    if (stage != null and stage.?.len == 0) return try allocator.dupe(u8, "{\"error\":\"stage is required\"}");

    const did_update = try state.updateSpace(id, .{ .name = name, .kind = kind, .stage = stage });
    if (!did_update) {
        return try allocator.dupe(u8, "{\"error\":\"space not found\"}");
    }
    try state.save();

    const updated = state.getSpace(id).?;
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    try appendSpaceJson(&buf, updated);
    return buf.toOwnedSlice();
}

fn appendSpaceJson(buf: *std.array_list.Managed(u8), space: state_mod.Space) !void {
    try buf.appendSlice("{\"id\":\"");
    try appendEscaped(buf, space.id);
    try buf.appendSlice("\",\"name\":\"");
    try appendEscaped(buf, space.name);
    try buf.appendSlice("\",\"kind\":\"");
    try appendEscaped(buf, space.kind);
    try buf.appendSlice("\",\"stage\":\"");
    try appendEscaped(buf, space.stage);
    try buf.appendSlice("\"}");
}

test "handleCreate lists and updates spaces" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const path = try fixture.paths.state(allocator);
    defer allocator.free(path);
    var state = state_mod.State.init(allocator, path);
    defer state.deinit();

    const created = try handleCreate(allocator, &state, "{\"id\":\"ops\",\"name\":\"Ops\",\"kind\":\"team\",\"stage\":\"active\"}");
    defer allocator.free(created);
    try std.testing.expect(std.mem.indexOf(u8, created, "\"id\":\"ops\"") != null);

    const list = try handleList(allocator, &state);
    defer allocator.free(list);
    try std.testing.expect(std.mem.indexOf(u8, list, "\"name\":\"Ops\"") != null);

    const updated = try handleUpdate(allocator, &state, "ops", "{\"stage\":\"paused\"}");
    defer allocator.free(updated);
    try std.testing.expect(std.mem.indexOf(u8, updated, "\"stage\":\"paused\"") != null);
}

test "space query decodes selected space" {
    const allocator = std.testing.allocator;
    const value = (try spaceQueryAlloc(allocator, "/api/providers?space=ops%201")).?;
    defer allocator.free(value);
    try std.testing.expectEqualStrings("ops 1", value);
}
