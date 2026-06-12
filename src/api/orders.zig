const std = @import("std");
const std_compat = @import("compat");
const orders = @import("../core/orders.zig");
const policy_orders = @import("../core/policy_orders.zig");
const paths_mod = @import("../core/paths.zig");
const state_mod = @import("../core/state.zig");
const helpers = @import("helpers.zig");
const query = @import("query.zig");
const schedule_order_bridge = @import("schedule_order_bridge.zig");
const spaces_api = @import("spaces.zig");

const appendEscaped = helpers.appendEscaped;

pub fn isOrdersCollectionPath(target: []const u8) bool {
    const clean = query.stripTarget(target);
    return std.mem.eql(u8, clean, "/api/orders");
}

pub fn orderIdFromTarget(allocator: std.mem.Allocator, target: []const u8) !?[]u8 {
    const clean = query.stripTarget(target);
    const prefix = "/api/orders/";
    if (!std.mem.startsWith(u8, clean, prefix)) return null;
    const rest = clean[prefix.len..];
    if (rest.len == 0) return null;
    if (std.mem.indexOfScalar(u8, rest, '/') != null) return null;
    return try query.decodePathSegmentAlloc(allocator, rest);
}

pub fn scheduleOrderIdFromTarget(allocator: std.mem.Allocator, target: []const u8) !?[]u8 {
    return orderIdFromActionTarget(allocator, target, "schedule");
}

pub fn transitionOrderIdFromTarget(allocator: std.mem.Allocator, target: []const u8) !?[]u8 {
    const action = actionFromTarget(target) orelse return null;
    if (orders.Transition.fromString(action) == null) return null;
    return orderIdFromActionTarget(allocator, target, action);
}

pub fn transitionFromTarget(target: []const u8) ?orders.Transition {
    const action = actionFromTarget(target) orelse return null;
    return orders.Transition.fromString(action);
}

pub fn isScheduleTarget(target: []const u8) bool {
    const action = actionFromTarget(target) orelse return false;
    return std.mem.eql(u8, action, "schedule");
}

fn actionFromTarget(target: []const u8) ?[]const u8 {
    const clean = query.stripTarget(target);
    const prefix = "/api/orders/";
    if (!std.mem.startsWith(u8, clean, prefix)) return null;
    const rest = clean[prefix.len..];
    const slash = std.mem.indexOfScalar(u8, rest, '/') orelse return null;
    const action = rest[slash + 1 ..];
    if (action.len == 0 or std.mem.indexOfScalar(u8, action, '/') != null) return null;
    return action;
}

fn orderIdFromActionTarget(allocator: std.mem.Allocator, target: []const u8, expected_action: []const u8) !?[]u8 {
    const clean = query.stripTarget(target);
    const prefix = "/api/orders/";
    if (!std.mem.startsWith(u8, clean, prefix)) return null;
    const rest = clean[prefix.len..];
    const slash = std.mem.indexOfScalar(u8, rest, '/') orelse return null;
    const segment = rest[0..slash];
    const action = rest[slash + 1 ..];
    if (segment.len == 0 or action.len == 0) return null;
    if (std.mem.indexOfScalar(u8, action, '/') != null) return null;
    if (!std.mem.eql(u8, action, expected_action)) return null;
    return try query.decodePathSegmentAlloc(allocator, segment);
}

pub fn handleList(allocator: std.mem.Allocator, paths: paths_mod.Paths, target: []const u8) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    const loaded = orders.list(allocator, paths, space_id) catch return helpers.serverError();
    defer {
        for (loaded) |order| order.deinit(allocator);
        allocator.free(loaded);
    }

    const body = renderList(allocator, loaded) catch return helpers.serverError();
    return helpers.jsonOk(body);
}

pub fn handleGet(allocator: std.mem.Allocator, paths: paths_mod.Paths, target: []const u8, order_id: []const u8) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    const order = orders.get(allocator, paths, space_id, order_id) catch |err| switch (err) {
        error.InvalidOrderId => return helpers.badRequest("{\"error\":\"invalid order id\"}"),
        error.OrderNotFound => return helpers.notFound(),
        else => return helpers.serverError(),
    };
    defer order.deinit(allocator);

    const body = renderOrder(allocator, order) catch return helpers.serverError();
    return helpers.jsonOk(body);
}

pub fn handleCreate(allocator: std.mem.Allocator, paths: paths_mod.Paths, state: *state_mod.State, target: []const u8, body: []const u8, now_ms: i64) helpers.ApiResponse {
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

    const title = stringField(root, "title") orelse return helpers.badRequest("{\"error\":\"title is required\"}");
    if (std.mem.trim(u8, title, &std.ascii.whitespace).len == 0) {
        return helpers.badRequest("{\"error\":\"title is required\"}");
    }

    const order = orders.create(allocator, paths, space_id, .{
        .id = stringField(root, "id") orelse "",
        .title = title,
        .summary = stringField(root, "summary") orelse "",
        .kind = stringField(root, "kind") orelse "mandate",
        .schedule = stringField(root, "schedule") orelse "",
        .content = stringField(root, "content") orelse stringField(root, "body") orelse "",
        .created_at_ms = intField(root, "created_at_ms") orelse now_ms,
        .updated_at_ms = intField(root, "updated_at_ms") orelse now_ms,
    }) catch |err| switch (err) {
        error.InvalidOrderId => return helpers.badRequest("{\"error\":\"invalid order id\"}"),
        error.DuplicateOrder => return .{ .status = "409 Conflict", .content_type = "application/json", .body = "{\"error\":\"order already exists\"}" },
        else => return helpers.serverError(),
    };
    defer order.deinit(allocator);

    applyOrderMutationSideEffects(allocator, paths, state, order, "order.created", "Order created", now_ms) catch return helpers.serverError();

    const response = renderOrder(allocator, order) catch return helpers.serverError();
    return .{ .status = "201 Created", .content_type = "application/json", .body = response };
}

pub fn handleUpdate(allocator: std.mem.Allocator, paths: paths_mod.Paths, state: *state_mod.State, target: []const u8, order_id: []const u8, body: []const u8, now_ms: i64) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    var tree = parseJsonObject(allocator, body) catch return helpers.badRequest("{\"error\":\"invalid JSON body\"}");
    defer tree.deinit();
    const root = tree.value.object;

    const status = if (stringField(root, "status")) |raw_status| blk: {
        break :blk orders.Status.fromString(raw_status) orelse return helpers.badRequest("{\"error\":\"invalid status\"}");
    } else null;

    const order = orders.update(allocator, paths, space_id, order_id, .{
        .title = stringField(root, "title"),
        .summary = stringField(root, "summary"),
        .kind = stringField(root, "kind"),
        .schedule = stringField(root, "schedule"),
        .content = stringField(root, "content") orelse stringField(root, "body"),
        .status = status,
        .updated_at_ms = intField(root, "updated_at_ms") orelse now_ms,
    }) catch |err| switch (err) {
        error.InvalidOrderId => return helpers.badRequest("{\"error\":\"invalid order id\"}"),
        error.OrderNotFound => return helpers.notFound(),
        else => return helpers.serverError(),
    };
    defer order.deinit(allocator);

    applyOrderMutationSideEffects(allocator, paths, state, order, "order.updated", "Order updated", now_ms) catch return helpers.serverError();

    const response = renderOrder(allocator, order) catch return helpers.serverError();
    return helpers.jsonOk(response);
}

pub fn handleTransition(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    target: []const u8,
    order_id: []const u8,
    transition: orders.Transition,
    now_ms: i64,
    cron_api: ?schedule_order_bridge.CronApi,
) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    const current_order = orders.get(allocator, paths, space_id, order_id) catch |err| switch (err) {
        error.InvalidOrderId => return helpers.badRequest("{\"error\":\"invalid order id\"}"),
        error.OrderNotFound => return helpers.notFound(),
        else => return helpers.serverError(),
    };
    defer current_order.deinit(allocator);

    if (schedule_order_bridge.beforeTransition(allocator, paths, state, cron_api, current_order, transition, now_ms)) |bridge_resp| {
        return bridge_resp;
    }

    const order = orders.transition(allocator, paths, space_id, order_id, transition, now_ms) catch |err| switch (err) {
        error.InvalidOrderId => return helpers.badRequest("{\"error\":\"invalid order id\"}"),
        error.OrderNotFound => return helpers.notFound(),
        else => return helpers.serverError(),
    };
    defer order.deinit(allocator);

    applyOrderMutationSideEffects(allocator, paths, state, order, transition.eventType(), "Order status changed", now_ms) catch return helpers.serverError();

    const response = renderOrder(allocator, order) catch return helpers.serverError();
    return helpers.jsonOk(response);
}

pub fn handleSchedule(allocator: std.mem.Allocator, paths: paths_mod.Paths, state: *state_mod.State, target: []const u8, order_id: []const u8, body: []const u8, now_ms: i64) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    var tree = parseJsonObject(allocator, body) catch return helpers.badRequest("{\"error\":\"invalid JSON body\"}");
    defer tree.deinit();
    const schedule_value = stringField(tree.value.object, "schedule") orelse
        return helpers.badRequest("{\"error\":\"schedule is required\"}");

    const order = orders.schedule(allocator, paths, space_id, order_id, schedule_value, now_ms) catch |err| switch (err) {
        error.InvalidOrderId => return helpers.badRequest("{\"error\":\"invalid order id\"}"),
        error.OrderNotFound => return helpers.notFound(),
        else => return helpers.serverError(),
    };
    defer order.deinit(allocator);

    applyOrderMutationSideEffects(allocator, paths, state, order, "order.scheduled", "Order schedule updated", now_ms) catch return helpers.serverError();

    const response = renderOrder(allocator, order) catch return helpers.serverError();
    return helpers.jsonOk(response);
}

pub fn handleDelete(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    target: []const u8,
    order_id: []const u8,
    now_ms: i64,
    cron_api: ?schedule_order_bridge.CronApi,
) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    const current_order = orders.get(allocator, paths, space_id, order_id) catch |err| switch (err) {
        error.InvalidOrderId => return helpers.badRequest("{\"error\":\"invalid order id\"}"),
        error.OrderNotFound => return helpers.notFound(),
        else => return helpers.serverError(),
    };
    defer current_order.deinit(allocator);

    if (schedule_order_bridge.beforeDelete(allocator, paths, cron_api, current_order)) |bridge_resp| {
        return bridge_resp;
    }

    const order = orders.remove(allocator, paths, space_id, order_id) catch |err| switch (err) {
        error.InvalidOrderId => return helpers.badRequest("{\"error\":\"invalid order id\"}"),
        error.OrderNotFound => return helpers.notFound(),
        else => return helpers.serverError(),
    };
    defer order.deinit(allocator);

    applyOrderMutationSideEffects(allocator, paths, state, order, "order.deleted", "Order deleted", now_ms) catch return helpers.serverError();

    const response = renderDelete(allocator, order) catch return helpers.serverError();
    return helpers.jsonOk(response);
}

fn appendOrderEvent(state: *state_mod.State, order: orders.Order, event_type: []const u8, summary: []const u8, now_ms: i64) !void {
    const payload_json = "{}";
    _ = try state.addEvent(.{
        .space_id = order.space_id,
        .event_type = event_type,
        .source = "nullhub",
        .subject_type = "order",
        .subject_id = order.id,
        .title = order.title,
        .summary = summary,
        .severity = "info",
        .payload_json = payload_json,
        .created_at_ms = now_ms,
    });
}

fn applyOrderMutationSideEffects(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    order: orders.Order,
    event_type: []const u8,
    summary: []const u8,
    now_ms: i64,
) !void {
    const sync_result = try policy_orders.syncManagedOrdersForSpace(allocator, paths, state, order.space_id);
    try appendOrderEvent(state, order, event_type, summary, now_ms);
    if (sync_result.overflowed) {
        try appendPolicyOrdersOverflowEvent(state, order, now_ms);
    }
    if (sync_result.unsupported_bootstrap_count > 0) {
        try policy_orders.appendUnsupportedBootstrapEvent(
            allocator,
            state,
            order.space_id,
            "order",
            order.id,
            "Policy Orders bootstrap storage unsupported",
            now_ms,
            sync_result.unsupported_bootstrap_count,
        );
    }
    try state.save();
}

fn appendPolicyOrdersOverflowEvent(state: *state_mod.State, order: orders.Order, now_ms: i64) !void {
    _ = try state.addEvent(.{
        .space_id = order.space_id,
        .event_type = "order.policy_orders_overflow",
        .source = "nullhub",
        .subject_type = "order",
        .subject_id = order.id,
        .title = "Policy Orders exceeded ORDERS.md budget",
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

fn intField(root: std.json.ObjectMap, key: []const u8) ?i64 {
    return switch (root.get(key) orelse return null) {
        .integer => |value| @intCast(value),
        else => null,
    };
}

fn renderList(allocator: std.mem.Allocator, items: []const orders.Order) ![]const u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    try buf.appendSlice("{\"orders\":[");
    for (items, 0..) |order, idx| {
        if (idx > 0) try buf.append(',');
        try appendOrderJson(&buf, order);
    }
    try buf.appendSlice("]}");
    return buf.toOwnedSlice();
}

fn renderOrder(allocator: std.mem.Allocator, order: orders.Order) ![]const u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    try appendOrderJson(&buf, order);
    return buf.toOwnedSlice();
}

fn appendOrderJson(buf: *std.array_list.Managed(u8), order: orders.Order) !void {
    try buf.appendSlice("{\"id\":\"");
    try appendEscaped(buf, order.id);
    try buf.appendSlice("\",\"space_id\":\"");
    try appendEscaped(buf, order.space_id);
    try buf.appendSlice("\",\"title\":\"");
    try appendEscaped(buf, order.title);
    try buf.appendSlice("\",\"summary\":\"");
    try appendEscaped(buf, order.summary);
    try buf.appendSlice("\",\"kind\":\"");
    try appendEscaped(buf, order.kind);
    try buf.appendSlice("\",\"status\":\"");
    try appendEscaped(buf, order.status);
    try buf.appendSlice("\",\"schedule\":\"");
    try appendEscaped(buf, order.schedule);
    try buf.appendSlice("\",\"doc_path\":\"");
    try appendEscaped(buf, order.doc_path);
    try buf.appendSlice("\",\"content\":\"");
    try appendEscaped(buf, order.content);
    try appendFmt(buf, "\",\"created_at_ms\":{d},\"updated_at_ms\":{d}", .{ order.created_at_ms, order.updated_at_ms });
    try buf.appendSlice("}");
}

fn renderDelete(allocator: std.mem.Allocator, order: orders.Order) ![]const u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    try buf.appendSlice("{\"status\":\"deleted\",\"id\":\"");
    try appendEscaped(&buf, order.id);
    try buf.appendSlice("\"}");
    return buf.toOwnedSlice();
}

fn appendFmt(buf: *std.array_list.Managed(u8), comptime fmt: []const u8, args: anytype) !void {
    const rendered = try std.fmt.allocPrint(buf.allocator, fmt, args);
    defer buf.allocator.free(rendered);
    try buf.appendSlice(rendered);
}

test "orders API creates updates schedules transitions and emits events" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    {
        const resp = handleCreate(allocator, fixture.paths, &state, "/api/orders?space=ops", "{\"title\":\"Morning report\",\"summary\":\"Daily brief\",\"content\":\"# Brief\\n\"}", 1000);
        defer allocator.free(resp.body);
        try std.testing.expectEqualStrings("201 Created", resp.status);
        try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"id\":\"order-1\"") != null);
    }

    {
        const resp = handleUpdate(allocator, fixture.paths, &state, "/api/orders/order-1?space=ops", "order-1", "{\"title\":\"Updated report\"}", 1100);
        defer allocator.free(resp.body);
        try std.testing.expectEqualStrings("200 OK", resp.status);
        try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"title\":\"Updated report\"") != null);
    }

    {
        const resp = handleSchedule(allocator, fixture.paths, &state, "/api/orders/order-1/schedule?space=ops", "order-1", "{\"schedule\":\"0 9 * * *\"}", 1200);
        defer allocator.free(resp.body);
        try std.testing.expectEqualStrings("200 OK", resp.status);
        try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"schedule\":\"0 9 * * *\"") != null);
    }

    const transitions = [_]orders.Transition{ .activate, .pause, .resume_order, .draft, .archive };
    for (transitions, 0..) |transition, idx| {
        const resp = handleTransition(allocator, fixture.paths, &state, "/api/orders/order-1/activate?space=ops", "order-1", transition, 1300 + @as(i64, @intCast(idx)), null);
        defer allocator.free(resp.body);
        try std.testing.expectEqualStrings("200 OK", resp.status);
    }

    const events = state.eventsList();
    try std.testing.expectEqual(@as(usize, 8), events.len);
    try std.testing.expectEqualStrings("order.created", events[0].event_type);
    try std.testing.expectEqualStrings("order.updated", events[1].event_type);
    try std.testing.expectEqualStrings("order.scheduled", events[2].event_type);
    try std.testing.expectEqualStrings("order.archived", events[7].event_type);
}

test "orders API deletes records without treating archive as delete" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    {
        const resp = handleCreate(allocator, fixture.paths, &state, "/api/orders?space=ops", "{\"title\":\"Temporary order\"}", 1000);
        defer allocator.free(resp.body);
        try std.testing.expectEqualStrings("201 Created", resp.status);
    }

    {
        const archive_resp = handleTransition(allocator, fixture.paths, &state, "/api/orders/order-1/archive?space=ops", "order-1", .archive, 1100, null);
        defer allocator.free(archive_resp.body);
        try std.testing.expectEqualStrings("200 OK", archive_resp.status);

        const get_resp = handleGet(allocator, fixture.paths, "/api/orders/order-1?space=ops", "order-1");
        defer allocator.free(get_resp.body);
        try std.testing.expectEqualStrings("200 OK", get_resp.status);
        try std.testing.expect(std.mem.indexOf(u8, get_resp.body, "\"status\":\"archived\"") != null);
    }

    {
        const delete_resp = handleDelete(allocator, fixture.paths, &state, "/api/orders/order-1?space=ops", "order-1", 1200, null);
        defer allocator.free(delete_resp.body);
        try std.testing.expectEqualStrings("200 OK", delete_resp.status);
        try std.testing.expect(std.mem.indexOf(u8, delete_resp.body, "\"status\":\"deleted\"") != null);

        const missing_resp = handleGet(allocator, fixture.paths, "/api/orders/order-1?space=ops", "order-1");
        try std.testing.expectEqualStrings("404 Not Found", missing_resp.status);
    }

    const events = state.eventsList();
    try std.testing.expectEqual(@as(usize, 3), events.len);
    try std.testing.expectEqualStrings("order.created", events[0].event_type);
    try std.testing.expectEqualStrings("order.archived", events[1].event_type);
    try std.testing.expectEqualStrings("order.deleted", events[2].event_type);
}

test "orders API rejects traversal space ids before writing files" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    const traversal_resp = handleCreate(allocator, fixture.paths, &state, "/api/orders?space=..", "{\"title\":\"Traversal\"}", 1000);
    try std.testing.expectEqualStrings("400 Bad Request", traversal_resp.status);

    const dot_resp = handleCreate(allocator, fixture.paths, &state, "/api/orders?space=.", "{\"title\":\"Dot\"}", 1000);
    try std.testing.expectEqualStrings("400 Bad Request", dot_resp.status);

    const escaped_table = try std.fs.path.join(allocator, &.{ fixture.paths.root, "orders", "orders.json" });
    defer allocator.free(escaped_table);
    try expectFileNotFound(escaped_table);

    const dot_table = try std.fs.path.join(allocator, &.{ fixture.paths.root, "spaces", "orders", "orders.json" });
    defer allocator.free(dot_table);
    try expectFileNotFound(dot_table);
}

fn expectFileNotFound(path: []const u8) !void {
    if (std_compat.fs.openFileAbsolute(path, .{})) |file| {
        file.close();
        return error.ExpectedFileNotFound;
    } else |err| {
        try std.testing.expectEqual(error.FileNotFound, err);
    }
}

test "orders transition verbs accept canonical verbs and legacy aliases" {
    try std.testing.expectEqual(orders.Transition.activate, transitionFromTarget("/api/orders/order-1/activate?space=ops").?);
    try std.testing.expectEqual(orders.Transition.activate, transitionFromTarget("/api/orders/order-1/enact?space=ops").?);
    try std.testing.expectEqual(orders.Transition.pause, transitionFromTarget("/api/orders/order-1/pause?space=ops").?);
    try std.testing.expectEqual(orders.Transition.pause, transitionFromTarget("/api/orders/order-1/suspend?space=ops").?);
    try std.testing.expectEqualStrings("order.activated", orders.Transition.fromString("activate").?.eventType());
    try std.testing.expectEqualStrings("order.activated", orders.Transition.fromString("enact").?.eventType());
    try std.testing.expectEqualStrings("order.paused", orders.Transition.fromString("pause").?.eventType());
    try std.testing.expectEqualStrings("order.paused", orders.Transition.fromString("suspend").?.eventType());
}

test "orders API enact and suspend update managed ORDERS.md" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try state.addInstance("nullclaw", "ops-agent", .{ .version = "dev-local", .space_id = "ops" });

    {
        const resp = handleCreate(
            allocator,
            fixture.paths,
            &state,
            "/api/orders?space=ops",
            "{\"id\":\"policy-1\",\"title\":\"Keep approvals moving\",\"kind\":\"policy\",\"content\":\"Escalate stale approvals.\"}",
            1000,
        );
        defer allocator.free(resp.body);
        try std.testing.expectEqualStrings("201 Created", resp.status);
    }

    {
        const resp = handleTransition(allocator, fixture.paths, &state, "/api/orders/policy-1/enact?space=ops", "policy-1", .activate, 1100, null);
        defer allocator.free(resp.body);
        try std.testing.expectEqualStrings("200 OK", resp.status);
    }

    const workspace_dir = try fixture.paths.instanceWorkspaceDir(allocator, "nullclaw", "ops-agent");
    defer allocator.free(workspace_dir);
    const orders_path = try std.fs.path.join(allocator, &.{ workspace_dir, policy_orders.managed_orders_filename });
    defer allocator.free(orders_path);
    const config_path = try std.fs.path.join(allocator, &.{ workspace_dir, policy_orders.managed_orders_bootstrap_filename });
    defer allocator.free(config_path);

    {
        const bytes = try std_compat.fs.readFileAbsolute(allocator, orders_path, policy_orders.managed_orders_budget_bytes + 1);
        defer allocator.free(bytes);
        try std.testing.expect(std.mem.indexOf(u8, bytes, "Keep approvals moving") != null);
        try std.testing.expect(std.mem.indexOf(u8, bytes, "Escalate stale approvals.") != null);

        const config_bytes = try std_compat.fs.readFileAbsolute(allocator, config_path, policy_orders.managed_orders_budget_bytes + 4096);
        defer allocator.free(config_bytes);
        try std.testing.expect(std.mem.indexOf(u8, config_bytes, "NULLHUB:MANAGED_POLICY_ORDERS:BEGIN") != null);
        try std.testing.expect(std.mem.indexOf(u8, config_bytes, "Escalate stale approvals.") != null);
    }

    {
        const resp = handleTransition(allocator, fixture.paths, &state, "/api/orders/policy-1/suspend?space=ops", "policy-1", .pause, 1200, null);
        defer allocator.free(resp.body);
        try std.testing.expectEqualStrings("200 OK", resp.status);
    }

    {
        const bytes = try std_compat.fs.readFileAbsolute(allocator, orders_path, policy_orders.managed_orders_budget_bytes + 1);
        defer allocator.free(bytes);
        try std.testing.expect(std.mem.indexOf(u8, bytes, "No active policy Orders.") != null);
        try std.testing.expect(std.mem.indexOf(u8, bytes, "Escalate stale approvals.") == null);

        const config_bytes = try std_compat.fs.readFileAbsolute(allocator, config_path, policy_orders.managed_orders_budget_bytes + 4096);
        defer allocator.free(config_bytes);
        try std.testing.expect(std.mem.indexOf(u8, config_bytes, "No active policy Orders.") != null);
        try std.testing.expect(std.mem.indexOf(u8, config_bytes, "Escalate stale approvals.") == null);
    }
}

test "orders API emits warning event for unsupported policy bootstrap backend" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try state.addInstance("nullclaw", "ops-agent", .{ .version = "dev-local", .space_id = "ops" });
    const inst_dir = try fixture.paths.instanceDir(allocator, "nullclaw", "ops-agent");
    defer allocator.free(inst_dir);
    try std_compat.fs.makePathAbsolute(inst_dir);
    const config_path = try fixture.paths.instanceConfig(allocator, "nullclaw", "ops-agent");
    defer allocator.free(config_path);
    {
        const file = try std_compat.fs.createFileAbsolute(config_path, .{ .truncate = true });
        defer file.close();
        try file.writeAll("{\"memory\":{\"backend\":\"none\"}}\n");
    }

    {
        const resp = handleCreate(
            allocator,
            fixture.paths,
            &state,
            "/api/orders?space=ops",
            "{\"id\":\"policy-unsupported\",\"title\":\"Unsupported backend\",\"kind\":\"policy\",\"content\":\"Warn when bootstrap cannot refresh.\"}",
            1000,
        );
        defer allocator.free(resp.body);
        try std.testing.expectEqualStrings("201 Created", resp.status);
    }

    {
        const resp = handleTransition(allocator, fixture.paths, &state, "/api/orders/policy-unsupported/enact?space=ops", "policy-unsupported", .activate, 1100, null);
        defer allocator.free(resp.body);
        try std.testing.expectEqualStrings("200 OK", resp.status);
    }

    var warning_count: usize = 0;
    for (state.eventsList()) |event| {
        if (std.mem.eql(u8, event.event_type, "order.policy_orders_bootstrap_unsupported")) {
            warning_count += 1;
            try std.testing.expectEqualStrings("warning", event.severity);
            try std.testing.expect(std.mem.indexOf(u8, event.payload_json, "\"unsupported_count\":1") != null);
        }
    }
    try std.testing.expect(warning_count >= 1);
}

test "orders item id parser only accepts exact item route" {
    const allocator = std.testing.allocator;

    const exact = (try orderIdFromTarget(allocator, "/api/orders/order-1?space=ops")).?;
    defer allocator.free(exact);
    try std.testing.expectEqualStrings("order-1", exact);

    try std.testing.expect((try orderIdFromTarget(allocator, "/api/orders/order-1/not-a-route?space=ops")) == null);
    try std.testing.expect((try orderIdFromTarget(allocator, "/api/orders/order-1/schedule?space=ops")) == null);

    const schedule_id = (try scheduleOrderIdFromTarget(allocator, "/api/orders/order-1/schedule?space=ops")).?;
    defer allocator.free(schedule_id);
    try std.testing.expectEqualStrings("order-1", schedule_id);

    const transition_id = (try transitionOrderIdFromTarget(allocator, "/api/orders/order-1/archive?space=ops")).?;
    defer allocator.free(transition_id);
    try std.testing.expectEqualStrings("order-1", transition_id);
    try std.testing.expect((try transitionOrderIdFromTarget(allocator, "/api/orders/order-1/not-a-route?space=ops")) == null);
}
