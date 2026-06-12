const std = @import("std");
const std_compat = @import("compat");
const charter_store = @import("../core/charter.zig");
const paths_mod = @import("../core/paths.zig");
const policy_orders = @import("../core/policy_orders.zig");
const state_mod = @import("../core/state.zig");
const helpers = @import("helpers.zig");
const query = @import("query.zig");
const spaces_api = @import("spaces.zig");

const appendEscaped = helpers.appendEscaped;

pub fn isCharterPath(target: []const u8) bool {
    const clean = query.stripTarget(target);
    return std.mem.eql(u8, clean, "/api/charter");
}

pub fn handleGet(allocator: std.mem.Allocator, paths: paths_mod.Paths, target: []const u8) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    const charter = charter_store.loadOrDefault(allocator, paths, space_id) catch return helpers.serverError();
    defer charter.deinit(allocator);

    const body = renderCharter(allocator, charter) catch return helpers.serverError();
    return helpers.jsonOk(body);
}

pub fn handlePut(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    target: []const u8,
    body: []const u8,
    now_ms: i64,
) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    var tree = parseJsonObject(allocator, body) catch return helpers.badRequest("{\"error\":\"invalid JSON body\"}");
    defer tree.deinit();
    const root = tree.value.object;

    if (stringField(root, "space_id") orelse stringField(root, "space")) |body_space| {
        if (body_space.len > 0 and !std.mem.eql(u8, body_space, space_id)) {
            return helpers.badRequest("{\"error\":\"body space must match query space\"}");
        }
    }

    const stage = stringField(root, "stage") orelse charter_store.default_stage;
    if (std.mem.trim(u8, stage, &std.ascii.whitespace).len == 0) {
        return helpers.badRequest("{\"error\":\"stage is required\"}");
    }

    const saved = charter_store.put(allocator, paths, space_id, .{
        .stage = stage,
        .mission = stringField(root, "mission") orelse "",
        .autonomy_bounds = stringField(root, "autonomy_bounds") orelse "",
        .autonomy_defaults = stringField(root, "autonomy_defaults") orelse stringField(root, "defaults") orelse charter_store.default_autonomy_defaults,
        .metrics = stringField(root, "metrics") orelse "",
    }) catch return helpers.serverError();
    defer saved.deinit(allocator);

    applyCharterMutationSideEffects(allocator, paths, state, saved, now_ms) catch return helpers.serverError();

    const response = renderCharter(allocator, saved) catch return helpers.serverError();
    return helpers.jsonOk(response);
}

fn applyCharterMutationSideEffects(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    charter: charter_store.Charter,
    now_ms: i64,
) !void {
    const sync_result = try policy_orders.syncManagedOrdersForSpace(allocator, paths, state, charter.space_id);
    try appendCharterEvent(state, charter, now_ms);
    if (sync_result.overflowed) {
        try appendPolicyBootstrapOverflowEvent(state, charter, now_ms);
    }
    if (sync_result.unsupported_bootstrap_count > 0) {
        try policy_orders.appendUnsupportedBootstrapEvent(
            allocator,
            state,
            charter.space_id,
            "charter",
            "charter",
            "Charter bootstrap storage unsupported",
            now_ms,
            sync_result.unsupported_bootstrap_count,
        );
    }
    try state.save();
}

fn appendCharterEvent(state: *state_mod.State, charter: charter_store.Charter, now_ms: i64) !void {
    _ = try state.addEvent(.{
        .space_id = charter.space_id,
        .event_type = "charter.updated",
        .source = "nullhub",
        .subject_type = "charter",
        .subject_id = "charter",
        .title = "Charter updated",
        .summary = "Space Charter mission, autonomy defaults, or stage changed.",
        .severity = "info",
        .payload_json = "{}",
        .created_at_ms = now_ms,
    });
}

fn appendPolicyBootstrapOverflowEvent(state: *state_mod.State, charter: charter_store.Charter, now_ms: i64) !void {
    _ = try state.addEvent(.{
        .space_id = charter.space_id,
        .event_type = "charter.policy_bootstrap_overflow",
        .source = "nullhub",
        .subject_type = "charter",
        .subject_id = "charter",
        .title = "Charter and policy bootstrap exceeded ORDERS.md budget",
        .summary = "Managed ORDERS.md was truncated to the 24 KB prompt bootstrap budget.",
        .severity = "warning",
        .payload_json = "{\"file\":\"ORDERS.md\",\"budget_bytes\":24576}",
        .created_at_ms = now_ms,
    });
}

fn requiredSpaceQueryAlloc(allocator: std.mem.Allocator, target: []const u8) ![]u8 {
    const space_id = (try spaces_api.spaceQueryAlloc(allocator, target)) orelse return error.MissingSpace;
    errdefer allocator.free(space_id);
    if (!spaces_api.isValidSpaceId(space_id)) return error.InvalidSpace;
    if (!isSafeSpacePathSegment(space_id)) return error.InvalidSpace;
    return space_id;
}

fn isSafeSpacePathSegment(space_id: []const u8) bool {
    if (space_id.len == 0 or space_id[0] == '.') return false;
    for (space_id) |byte| {
        if (byte == 0 or byte == '/' or byte == '\\') return false;
    }
    return true;
}

fn parseJsonObject(allocator: std.mem.Allocator, body: []const u8) !std.json.Parsed(std.json.Value) {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{
        .allocate = .alloc_always,
    });
    if (parsed.value != .object) {
        var owned = parsed;
        owned.deinit();
        return error.InvalidJson;
    }
    return parsed;
}

fn stringField(root: std.json.ObjectMap, key: []const u8) ?[]const u8 {
    return switch (root.get(key) orelse return null) {
        .string => |value| value,
        else => null,
    };
}

fn renderCharter(allocator: std.mem.Allocator, charter: charter_store.Charter) ![]const u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();

    try buf.appendSlice("{\"space_id\":\"");
    try appendEscaped(&buf, charter.space_id);
    try buf.appendSlice("\",\"stage\":\"");
    try appendEscaped(&buf, charter.stage);
    try buf.appendSlice("\",\"mission\":\"");
    try appendEscaped(&buf, charter.mission);
    try buf.appendSlice("\",\"autonomy_bounds\":\"");
    try appendEscaped(&buf, charter.autonomy_bounds);
    try buf.appendSlice("\",\"autonomy_defaults\":\"");
    try appendEscaped(&buf, charter.autonomy_defaults);
    try buf.appendSlice("\",\"metrics\":\"");
    try appendEscaped(&buf, charter.metrics);
    try buf.appendSlice("\",\"doc_path\":\"");
    try appendEscaped(&buf, charter.doc_path);
    try buf.appendSlice("\"}");
    return buf.toOwnedSlice();
}

test "charter API stores per-space charter and rejects unsafe space ids" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    {
        const resp = handleGet(allocator, fixture.paths, "/api/charter");
        try std.testing.expectEqualStrings("400 Bad Request", resp.status);
    }
    {
        const resp = handlePut(allocator, fixture.paths, &state, "/api/charter?space=..", "{\"stage\":\"alpha\"}", 1000);
        try std.testing.expectEqualStrings("400 Bad Request", resp.status);
    }

    const body =
        "{\"stage\":\"alpha\",\"mission\":\"Keep the studio useful.\"," ++
        "\"autonomy_bounds\":\"Ask before external spend.\"," ++
        "\"autonomy_defaults\":\"T2 after review.\"," ++
        "\"metrics\":\"completed work and blocked approvals\"}";
    const put_resp = handlePut(allocator, fixture.paths, &state, "/api/charter?space=ops", body, 1100);
    defer allocator.free(put_resp.body);
    try std.testing.expectEqualStrings("200 OK", put_resp.status);
    try std.testing.expect(std.mem.indexOf(u8, put_resp.body, "\"space_id\":\"ops\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, put_resp.body, "\"stage\":\"alpha\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, put_resp.body, "T2 after review.") != null);

    const get_resp = handleGet(allocator, fixture.paths, "/api/charter?space=ops");
    defer allocator.free(get_resp.body);
    try std.testing.expectEqualStrings("200 OK", get_resp.status);
    try std.testing.expect(std.mem.indexOf(u8, get_resp.body, "Keep the studio useful.") != null);

    const doc_path = try fixture.paths.spaceCharterDoc(allocator, "ops");
    defer allocator.free(doc_path);
    const doc = try std_compat.fs.readFileAbsolute(allocator, doc_path, 1024 * 1024);
    defer allocator.free(doc);
    try std.testing.expect(std.mem.indexOf(u8, doc, "## Autonomy Defaults") != null);
    try std.testing.expect(std.mem.indexOf(u8, doc, "T2 after review.") != null);
}

test "charter PUT injects managed charter through policy bootstrap path" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try state.addInstance("nullclaw", "ops-agent", .{ .version = "dev-local", .space_id = "ops" });

    const resp = handlePut(
        allocator,
        fixture.paths,
        &state,
        "/api/charter?space=ops",
        "{\"stage\":\"alpha\",\"mission\":\"Keep ops reliable.\",\"autonomy_bounds\":\"Ask before deleting data.\",\"autonomy_defaults\":\"T1 unless explicitly raised.\",\"metrics\":\"incidents and cycle time\"}",
        1200,
    );
    defer allocator.free(resp.body);
    try std.testing.expectEqualStrings("200 OK", resp.status);

    const workspace_dir = try fixture.paths.instanceWorkspaceDir(allocator, "nullclaw", "ops-agent");
    defer allocator.free(workspace_dir);
    const orders_path = try std.fs.path.join(allocator, &.{ workspace_dir, policy_orders.managed_orders_filename });
    defer allocator.free(orders_path);
    const config_path = try std.fs.path.join(allocator, &.{ workspace_dir, policy_orders.managed_orders_bootstrap_filename });
    defer allocator.free(config_path);

    const orders_bytes = try std_compat.fs.readFileAbsolute(allocator, orders_path, policy_orders.managed_orders_budget_bytes + 1);
    defer allocator.free(orders_bytes);
    try std.testing.expect(std.mem.indexOf(u8, orders_bytes, "## Space Charter") != null);
    try std.testing.expect(std.mem.indexOf(u8, orders_bytes, "Keep ops reliable.") != null);
    try std.testing.expect(std.mem.indexOf(u8, orders_bytes, "T1 unless explicitly raised.") != null);

    const config_bytes = try std_compat.fs.readFileAbsolute(allocator, config_path, policy_orders.managed_orders_budget_bytes + 4096);
    defer allocator.free(config_bytes);
    try std.testing.expect(std.mem.indexOf(u8, config_bytes, "NULLHUB:MANAGED_POLICY_ORDERS:BEGIN") != null);
    try std.testing.expect(std.mem.indexOf(u8, config_bytes, "Keep ops reliable.") != null);

    const events = state.eventsList();
    try std.testing.expectEqual(@as(usize, 1), events.len);
    try std.testing.expectEqualStrings("charter.updated", events[0].event_type);
}

test "charter PUT preserves field H2 markdown through persisted read and policy sync" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try state.addInstance("nullclaw", "ops-agent", .{ .version = "dev-local", .space_id = "ops" });

    const mission = "Line one\n## Details\nLine two";
    const resp = handlePut(
        allocator,
        fixture.paths,
        &state,
        "/api/charter?space=ops",
        "{\"stage\":\"alpha\",\"mission\":\"Line one\\n## Details\\nLine two\",\"autonomy_bounds\":\"Ask first.\",\"autonomy_defaults\":\"T1\",\"metrics\":\"cycle time\"}",
        1300,
    );
    defer allocator.free(resp.body);
    try std.testing.expectEqualStrings("200 OK", resp.status);

    var loaded = try charter_store.loadOrDefault(allocator, fixture.paths, "ops");
    defer loaded.deinit(allocator);
    try std.testing.expectEqualStrings(mission, loaded.mission);

    const workspace_dir = try fixture.paths.instanceWorkspaceDir(allocator, "nullclaw", "ops-agent");
    defer allocator.free(workspace_dir);
    const orders_path = try std.fs.path.join(allocator, &.{ workspace_dir, policy_orders.managed_orders_filename });
    defer allocator.free(orders_path);
    const config_path = try std.fs.path.join(allocator, &.{ workspace_dir, policy_orders.managed_orders_bootstrap_filename });
    defer allocator.free(config_path);

    const orders_bytes = try std_compat.fs.readFileAbsolute(allocator, orders_path, policy_orders.managed_orders_budget_bytes + 1);
    defer allocator.free(orders_bytes);
    try std.testing.expect(std.mem.indexOf(u8, orders_bytes, "Line one") != null);
    try std.testing.expect(std.mem.indexOf(u8, orders_bytes, "## Details") != null);
    try std.testing.expect(std.mem.indexOf(u8, orders_bytes, "Line two") != null);

    const config_bytes = try std_compat.fs.readFileAbsolute(allocator, config_path, policy_orders.managed_orders_budget_bytes + 4096);
    defer allocator.free(config_bytes);
    try std.testing.expect(std.mem.indexOf(u8, config_bytes, "Line one") != null);
    try std.testing.expect(std.mem.indexOf(u8, config_bytes, "## Details") != null);
    try std.testing.expect(std.mem.indexOf(u8, config_bytes, "Line two") != null);
}
