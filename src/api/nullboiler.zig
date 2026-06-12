const std = @import("std");
const http_proxy = @import("proxy.zig");
const query_api = @import("query.zig");
const approvals_api = @import("approvals.zig");
const state_mod = @import("../core/state.zig");

const Allocator = std.mem.Allocator;
const Response = http_proxy.Response;

const prefix = "/api/nullboiler";

pub const Config = struct {
    boiler_url: ?[]const u8 = null,
    boiler_token: ?[]const u8 = null,
    state: ?*state_mod.State = null,
    boiler_instance: ?[]const u8 = null,
    now_ms: i64 = 0,
};

pub fn isProxyPath(target: []const u8) bool {
    return http_proxy.isTargetInNamespace(target, prefix);
}

pub fn requestedBoilerInstance(allocator: Allocator, target: []const u8) !?[]u8 {
    if (!isProxyPath(target)) return null;
    const value = (try query_api.valueAlloc(allocator, target, "boiler_instance")) orelse return null;
    if (value.len == 0) {
        allocator.free(value);
        return null;
    }
    return value;
}

/// Proxies NullBoiler API requests. The shared `/api/nullboiler` prefix is
/// stripped before forwarding, so `/api/nullboiler/runs` becomes `/runs`.
pub fn handle(allocator: Allocator, method: []const u8, target: []const u8, body: []const u8, cfg: Config) Response {
    if (!isProxyPath(target)) {
        return .{ .status = "404 Not Found", .content_type = "application/json", .body = "{\"error\":\"not found\"}" };
    }

    if (cfg.state) |state| {
        const approval_space_id = instanceSpace(state, cfg.boiler_instance);
        if (blockResumeUntilApproved(allocator, state, target, approval_space_id)) |blocked| return blocked;
    }

    const base_url = cfg.boiler_url orelse
        return .{ .status = "503 Service Unavailable", .content_type = "application/json", .body = "{\"error\":\"NullBoiler not configured\"}" };

    const selector_params = [_][]const u8{"boiler_instance"};
    var forwarded = http_proxy.rewriteProductProxyTarget(allocator, target, .{
        .prefix = prefix,
        .selector_params = selector_params[0..],
        .default_path = "/",
    }) catch
        return .{ .status = "500 Internal Server Error", .content_type = "application/json", .body = "{\"error\":\"internal error\"}" };
    defer forwarded.deinit(allocator);

    const resp = http_proxy.forward(allocator, .{
        .method = method,
        .base_url = base_url,
        .path = forwarded.path,
        .body = body,
        .bearer_token = cfg.boiler_token,
        .unreachable_body = "{\"error\":\"NullBoiler unreachable\"}",
    });

    if (cfg.state) |state| {
        maybeCreateApprovalForInterruptedRun(
            allocator,
            state,
            cfg.boiler_instance,
            method,
            target,
            resp.status,
            resp.body,
            if (cfg.now_ms != 0) cfg.now_ms else 0,
        ) catch {
            allocator.free(resp.body);
            return .{ .status = "500 Internal Server Error", .content_type = "application/json", .body = "{\"error\":\"internal error\"}" };
        };
    }

    return resp;
}

fn blockResumeUntilApproved(allocator: Allocator, state: *state_mod.State, target: []const u8, space_id: []const u8) ?Response {
    const run_id = runIdFromResumeTargetAlloc(allocator, target) catch return .{
        .status = "400 Bad Request",
        .content_type = "application/json",
        .body = "{\"error\":\"invalid path segment\"}",
    };
    const owned_run_id = run_id orelse return null;
    defer allocator.free(owned_run_id);

    const approval = latestApprovalForRun(state, space_id, owned_run_id) orelse return null;
    if (std.mem.eql(u8, approval.status, "approved")) return null;
    if (std.mem.eql(u8, approval.status, "pending")) {
        const response_body = std.json.Stringify.valueAlloc(allocator, .{
            .@"error" = "workflow run is waiting for approval",
            .approval_id = approval.id,
            .approval_status = approval.status,
            .target_ref = approval.target_ref,
        }, .{}) catch return .{ .status = "500 Internal Server Error", .content_type = "application/json", .body = "{\"error\":\"internal error\"}" };
        return .{ .status = "423 Locked", .content_type = "application/json", .body = response_body };
    }

    const response_body = std.json.Stringify.valueAlloc(allocator, .{
        .@"error" = "workflow run approval was not approved",
        .approval_id = approval.id,
        .approval_status = approval.status,
        .target_ref = approval.target_ref,
    }, .{}) catch return .{ .status = "500 Internal Server Error", .content_type = "application/json", .body = "{\"error\":\"internal error\"}" };
    return .{ .status = "409 Conflict", .content_type = "application/json", .body = response_body };
}

fn maybeCreateApprovalForInterruptedRun(
    allocator: Allocator,
    state: *state_mod.State,
    boiler_instance: ?[]const u8,
    method: []const u8,
    target: []const u8,
    status: []const u8,
    response_body: []const u8,
    now_ms: i64,
) !void {
    if (!isSuccessStatus(status)) return;
    if (!std.mem.eql(u8, method, "POST") and !std.mem.eql(u8, method, "GET")) return;

    const space_id = instanceSpace(state, boiler_instance);
    var interrupt = (try approvalInterruptFromBodyAlloc(allocator, target, response_body, space_id)) orelse return;
    defer interrupt.deinit(allocator);

    if (latestApprovalForTarget(state, space_id, interrupt.target_ref) != null) return;

    const title = try std.fmt.allocPrint(allocator, "Approve workflow run {s}", .{interrupt.run_id});
    defer allocator.free(title);
    const summary = try std.fmt.allocPrint(
        allocator,
        "NullBoiler approval node {s} blocked workflow run {s}.",
        .{ interrupt.node_id, interrupt.run_id },
    );
    defer allocator.free(summary);

    _ = try approvals_api.createProducerApproval(state, .{
        .space_id = space_id,
        .kind = "signature",
        .queue = "workflows",
        .target_ref = interrupt.target_ref,
        .title = title,
        .summary = summary,
        .created_at_ms = now_ms,
    }, now_ms);
}

const ApprovalInterrupt = struct {
    run_id: []u8,
    node_id: []u8,
    target_ref: []u8,

    fn deinit(self: ApprovalInterrupt, allocator: Allocator) void {
        allocator.free(self.run_id);
        allocator.free(self.node_id);
        allocator.free(self.target_ref);
    }
};

fn approvalInterruptFromBodyAlloc(allocator: Allocator, target: []const u8, body: []const u8, space_id: []const u8) !?ApprovalInterrupt {
    var parsed = std.json.parseFromSlice(std.json.Value, allocator, body, .{
        .allocate = .alloc_always,
        .ignore_unknown_fields = true,
    }) catch return null;
    defer parsed.deinit();

    if (!isApprovalInterrupt(parsed.value)) return null;

    const run_id = (try runIdFromValueOrTargetAlloc(allocator, parsed.value, target)) orelse return null;
    errdefer allocator.free(run_id);
    const node_id = (try firstStringDeepAlloc(allocator, parsed.value, &.{ "approval_node_id", "node_id", "step_id", "def_step_id" })) orelse
        try allocator.dupe(u8, "approval");
    errdefer allocator.free(node_id);

    const target_ref = try std.fmt.allocPrint(allocator, "workflow_run:{s}:space:{s}:approval:{s}", .{ run_id, space_id, node_id });
    return .{ .run_id = run_id, .node_id = node_id, .target_ref = target_ref };
}

fn runIdFromValueOrTargetAlloc(allocator: Allocator, value: std.json.Value, target: []const u8) !?[]u8 {
    if (value == .object) {
        if (stringField(value.object, "run_id")) |run_id| return try allocator.dupe(u8, run_id);
        if (stringField(value.object, "id")) |run_id| return try allocator.dupe(u8, run_id);
    }
    if (try firstStringDeepAlloc(allocator, value, &.{"run_id"})) |run_id| return run_id;
    return runIdFromRunTargetAlloc(allocator, target);
}

fn isApprovalInterrupt(value: std.json.Value) bool {
    const status = firstStringDeep(value, &.{ "status", "state" }) orelse return false;
    if (!std.ascii.eqlIgnoreCase(status, "interrupted") and
        !std.ascii.eqlIgnoreCase(status, "blocked") and
        !std.ascii.eqlIgnoreCase(status, "waiting"))
    {
        return false;
    }

    if (firstStringDeep(value, &.{ "interrupt_type", "interrupt_kind", "node_type", "node_kind", "step_type", "kind", "type" })) |marker| {
        if (containsApprovalMarker(marker)) return true;
        if (containsInterruptMarker(marker) and firstStringDeep(value, &.{ "approval_node_id", "def_step_id", "node_id", "step_id" }) != null) return true;
    }
    if (firstStringDeep(value, &.{ "approval_node_id", "def_step_id", "node_id", "step_id" })) |node_marker| {
        if (containsApprovalMarker(node_marker)) return true;
    }
    if (firstStringDeep(value, &.{ "interrupt_message", "message", "reason", "summary" })) |message| {
        if (containsApprovalMarker(message)) return true;
    }
    return false;
}

fn containsInterruptMarker(value: []const u8) bool {
    return containsIgnoreCase(value, "interrupt");
}

fn containsApprovalMarker(value: []const u8) bool {
    return containsIgnoreCase(value, "approval") or
        containsIgnoreCase(value, "signature") or
        containsIgnoreCase(value, "human");
}

fn containsIgnoreCase(haystack: []const u8, needle: []const u8) bool {
    if (needle.len == 0 or haystack.len < needle.len) return false;
    var idx: usize = 0;
    while (idx + needle.len <= haystack.len) : (idx += 1) {
        if (std.ascii.eqlIgnoreCase(haystack[idx .. idx + needle.len], needle)) return true;
    }
    return false;
}

fn firstStringDeep(value: std.json.Value, keys: []const []const u8) ?[]const u8 {
    switch (value) {
        .object => |object| {
            for (keys) |key| {
                if (stringField(object, key)) |found| return found;
            }
            var it = object.iterator();
            while (it.next()) |entry| {
                if (firstStringDeep(entry.value_ptr.*, keys)) |found| return found;
            }
        },
        .array => |array| {
            for (array.items) |item| {
                if (firstStringDeep(item, keys)) |found| return found;
            }
        },
        else => {},
    }
    return null;
}

fn firstStringDeepAlloc(allocator: Allocator, value: std.json.Value, keys: []const []const u8) !?[]u8 {
    const found = firstStringDeep(value, keys) orelse return null;
    return try allocator.dupe(u8, found);
}

fn stringField(object: std.json.ObjectMap, key: []const u8) ?[]const u8 {
    return switch (object.get(key) orelse return null) {
        .string => |value| if (value.len > 0) value else null,
        else => null,
    };
}

fn runIdFromResumeTargetAlloc(allocator: Allocator, target: []const u8) !?[]u8 {
    const clean = query_api.stripTarget(target);
    const prefix_value = "/api/nullboiler/runs/";
    if (!std.mem.startsWith(u8, clean, prefix_value)) return null;
    const rest = clean[prefix_value.len..];
    const suffix = "/resume";
    if (!std.mem.endsWith(u8, rest, suffix)) return null;
    const segment = rest[0 .. rest.len - suffix.len];
    if (segment.len == 0 or std.mem.indexOfScalar(u8, segment, '/') != null) return null;
    return try query_api.decodePathSegmentAlloc(allocator, segment);
}

fn runIdFromRunTargetAlloc(allocator: Allocator, target: []const u8) !?[]u8 {
    const clean = query_api.stripTarget(target);
    const prefix_value = "/api/nullboiler/runs/";
    if (!std.mem.startsWith(u8, clean, prefix_value)) return null;
    const rest = clean[prefix_value.len..];
    if (rest.len == 0) return null;
    const slash = std.mem.indexOfScalar(u8, rest, '/');
    const segment = if (slash) |idx| rest[0..idx] else rest;
    if (segment.len == 0) return null;
    return try query_api.decodePathSegmentAlloc(allocator, segment);
}

fn latestApprovalForRun(state: *state_mod.State, space_id: []const u8, run_id: []const u8) ?state_mod.Approval {
    var prefix_buf: [512]u8 = undefined;
    const prefix_value = std.fmt.bufPrint(&prefix_buf, "workflow_run:{s}", .{run_id}) catch return null;
    var latest: ?state_mod.Approval = null;
    for (state.approvalsList()) |approval| {
        if (!std.mem.eql(u8, approval.space_id, space_id)) continue;
        const matches = std.mem.eql(u8, approval.target_ref, prefix_value) or
            (std.mem.startsWith(u8, approval.target_ref, prefix_value) and
                approval.target_ref.len > prefix_value.len and
                approval.target_ref[prefix_value.len] == ':');
        if (!matches) continue;
        if (latest == null or approval.id > latest.?.id) latest = approval;
    }
    return latest;
}

fn latestApprovalForTarget(state: *state_mod.State, space_id: []const u8, target_ref: []const u8) ?state_mod.Approval {
    var latest: ?state_mod.Approval = null;
    for (state.approvalsList()) |approval| {
        if (!std.mem.eql(u8, approval.space_id, space_id)) continue;
        if (!std.mem.eql(u8, approval.target_ref, target_ref)) continue;
        if (latest == null or approval.id > latest.?.id) latest = approval;
    }
    return latest;
}

fn instanceSpace(state: *state_mod.State, boiler_instance: ?[]const u8) []const u8 {
    if (boiler_instance) |name| {
        if (state.getInstance("nullboiler", name)) |entry| {
            if (entry.space_id.len > 0) return entry.space_id;
        }
    }
    return "default";
}

fn isSuccessStatus(status: []const u8) bool {
    return status.len >= 3 and status[0] == '2' and std.ascii.isDigit(status[1]) and std.ascii.isDigit(status[2]);
}

test "isProxyPath matches NullBoiler namespace" {
    try std.testing.expect(isProxyPath("/api/nullboiler"));
    try std.testing.expect(isProxyPath("/api/nullboiler?boiler_instance=worker-a"));
    try std.testing.expect(isProxyPath("/api/nullboiler/runs"));
    try std.testing.expect(!isProxyPath("/api/nulltickets/store/search"));
    try std.testing.expect(!isProxyPath("/api/nullwatch/v1/runs"));
    try std.testing.expect(!isProxyPath("/api/instances"));
}

test "requestedBoilerInstance decodes NullBoiler target selection" {
    const allocator = std.testing.allocator;
    const value = (try requestedBoilerInstance(allocator, "/api/nullboiler/workflows?boiler_instance=boiler%20a")).?;
    defer allocator.free(value);
    try std.testing.expectEqualStrings("boiler a", value);
    try std.testing.expect(try requestedBoilerInstance(allocator, "/api/nulltickets/store/ns?boiler_instance=boiler-a") == null);
}

test "rewriteProductProxyTarget strips only NullBoiler selector params" {
    const allocator = std.testing.allocator;
    const selector_params = [_][]const u8{"boiler_instance"};
    var forwarded = try http_proxy.rewriteProductProxyTarget(allocator, "/api/nullboiler/runs?boiler_instance=boiler-a&status=running", .{
        .prefix = prefix,
        .selector_params = selector_params[0..],
    });
    defer forwarded.deinit(allocator);
    try std.testing.expectEqualStrings("/api/nullboiler/runs?status=running", forwarded.target);
    try std.testing.expectEqualStrings("/runs?status=running", forwarded.path);

    var upstream_filter = try http_proxy.rewriteProductProxyTarget(allocator, "/api/nullboiler/runs?worker=primary", .{
        .prefix = prefix,
        .selector_params = selector_params[0..],
    });
    defer upstream_filter.deinit(allocator);
    try std.testing.expectEqualStrings("/api/nullboiler/runs?worker=primary", upstream_filter.target);
    try std.testing.expectEqualStrings("/runs?worker=primary", upstream_filter.path);
}

test "handle returns not configured without NullBoiler URL" {
    const resp = handle(std.testing.allocator, "GET", "/api/nullboiler/runs", "", .{});
    try std.testing.expectEqualStrings("503 Service Unavailable", resp.status);
    try std.testing.expectEqualStrings("{\"error\":\"NullBoiler not configured\"}", resp.body);
}

test "handle returns 404 for non-NullBoiler paths" {
    const resp = handle(std.testing.allocator, "GET", "/api/status", "", .{});
    try std.testing.expectEqualStrings("404 Not Found", resp.status);
    try std.testing.expectEqualStrings("{\"error\":\"not found\"}", resp.body);
}

test "handle rejects unsupported methods before fetch" {
    const resp = handle(std.testing.allocator, "HEAD", "/api/nullboiler/runs", "", .{
        .boiler_url = "http://127.0.0.1:8080",
    });
    try std.testing.expectEqualStrings("405 Method Not Allowed", resp.status);
    try std.testing.expectEqualStrings("{\"error\":\"method not allowed\"}", resp.body);
}

test "handle passes through upstream 409 status and body" {
    if (comptime @import("builtin").os.tag == .windows) return error.SkipZigTest;

    const allocator = std.testing.allocator;
    var upstream = try http_proxy.TestUpstream.start(allocator, "HTTP/1.1 409 Conflict\r\nContent-Type: application/json\r\nContent-Length: 20\r\n\r\n{\"error\":\"conflict\"}");
    defer upstream.deinit();

    const base_url = try upstream.baseUrl(allocator);
    defer allocator.free(base_url);

    const resp = handle(allocator, "GET", "/api/nullboiler/runs?boiler_instance=boiler-a&status=running", "", .{
        .boiler_url = base_url,
        .boiler_token = "boiler-token",
    });
    defer allocator.free(resp.body);

    try std.testing.expectEqualStrings("409 Conflict", resp.status);
    try std.testing.expectEqualStrings("{\"error\":\"conflict\"}", resp.body);
    try std.testing.expect(std.mem.indexOf(u8, upstream.request(), "GET /runs?status=running HTTP/1.1") != null);
    try std.testing.expect(std.mem.indexOf(u8, upstream.request(), "Authorization: Bearer boiler-token") != null);
    try std.testing.expect(std.mem.indexOf(u8, upstream.request(), "boiler_instance") == null);
}

test "handle creates approval for interrupted approval node" {
    if (comptime @import("builtin").os.tag == .windows) return error.SkipZigTest;

    const allocator = std.testing.allocator;
    const upstream_body = "{\"id\":\"run-1\",\"status\":\"interrupted\",\"interrupt_type\":\"approval\",\"node_id\":\"review\"}";
    const upstream_response = try std.fmt.allocPrint(
        allocator,
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {d}\r\n\r\n{s}",
        .{ upstream_body.len, upstream_body },
    );
    defer allocator.free(upstream_response);
    var upstream = try http_proxy.TestUpstream.start(allocator, upstream_response);
    defer upstream.deinit();

    const base_url = try upstream.baseUrl(allocator);
    defer allocator.free(base_url);

    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    try fixture.paths.ensureDirs();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();
    try state.addInstance("nullboiler", "boiler-a", .{ .version = "1.0.0", .space_id = "ops" });

    const resp = handle(allocator, "POST", "/api/nullboiler/workflows/wf-1/run?boiler_instance=boiler-a", "{\"input\":{}}", .{
        .boiler_url = base_url,
        .state = &state,
        .boiler_instance = "boiler-a",
        .now_ms = 1000,
    });
    defer allocator.free(resp.body);

    try std.testing.expectEqualStrings("200 OK", resp.status);
    try std.testing.expectEqual(@as(usize, 1), state.approvalsList().len);
    try std.testing.expectEqual(@as(usize, 1), state.eventsList().len);
    const approval = state.approvalsList()[0];
    try std.testing.expectEqualStrings("ops", approval.space_id);
    try std.testing.expectEqualStrings("signature", approval.kind);
    try std.testing.expectEqualStrings("workflows", approval.queue);
    try std.testing.expectEqualStrings("workflow_run:run-1:space:ops:approval:review", approval.target_ref);
    try std.testing.expectEqualStrings("pending", approval.status);
    try std.testing.expectEqualStrings("approval.created", state.eventsList()[0].event_type);
}

test "handle creates scoped approvals for real interrupt shape in two spaces" {
    if (comptime @import("builtin").os.tag == .windows) return error.SkipZigTest;

    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    try fixture.paths.ensureDirs();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();
    try state.addInstance("nullboiler", "boiler-ops", .{ .version = "1.0.0", .space_id = "ops" });
    try state.addInstance("nullboiler", "boiler-lab", .{ .version = "1.0.0", .space_id = "lab" });

    const upstream_body =
        \\{"id":"run-shared","status":"interrupted","steps":[{"id":"step-1","run_id":"run-shared","def_step_id":"human_approval","type":"interrupt","status":"completed"}]}
    ;
    const upstream_response = try std.fmt.allocPrint(
        allocator,
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {d}\r\n\r\n{s}",
        .{ upstream_body.len, upstream_body },
    );
    defer allocator.free(upstream_response);

    var upstream_ops = try http_proxy.TestUpstream.start(allocator, upstream_response);
    defer upstream_ops.deinit();
    const ops_url = try upstream_ops.baseUrl(allocator);
    defer allocator.free(ops_url);
    const ops_resp = handle(allocator, "POST", "/api/nullboiler/workflows/wf-1/run?boiler_instance=boiler-ops", "{\"input\":{}}", .{
        .boiler_url = ops_url,
        .state = &state,
        .boiler_instance = "boiler-ops",
        .now_ms = 1000,
    });
    defer allocator.free(ops_resp.body);
    try std.testing.expectEqualStrings("200 OK", ops_resp.status);

    var upstream_lab = try http_proxy.TestUpstream.start(allocator, upstream_response);
    defer upstream_lab.deinit();
    const lab_url = try upstream_lab.baseUrl(allocator);
    defer allocator.free(lab_url);
    const lab_resp = handle(allocator, "POST", "/api/nullboiler/workflows/wf-1/run?boiler_instance=boiler-lab", "{\"input\":{}}", .{
        .boiler_url = lab_url,
        .state = &state,
        .boiler_instance = "boiler-lab",
        .now_ms = 1001,
    });
    defer allocator.free(lab_resp.body);
    try std.testing.expectEqualStrings("200 OK", lab_resp.status);

    try std.testing.expectEqual(@as(usize, 2), state.approvalsList().len);
    try std.testing.expectEqualStrings("ops", state.approvalsList()[0].space_id);
    try std.testing.expectEqualStrings("workflow_run:run-shared:space:ops:approval:human_approval", state.approvalsList()[0].target_ref);
    try std.testing.expectEqualStrings("lab", state.approvalsList()[1].space_id);
    try std.testing.expectEqualStrings("workflow_run:run-shared:space:lab:approval:human_approval", state.approvalsList()[1].target_ref);

    const lab_blocked = handle(allocator, "POST", "/api/nullboiler/runs/run-shared/resume?boiler_instance=boiler-lab", "{\"state_updates\":{}}", .{
        .state = &state,
        .boiler_instance = "boiler-lab",
        .now_ms = 2000,
    });
    defer allocator.free(lab_blocked.body);
    try std.testing.expectEqualStrings("423 Locked", lab_blocked.status);
    try std.testing.expect(std.mem.indexOf(u8, lab_blocked.body, "\"approval_id\":2") != null);

    _ = try state.decideApproval(2, "approved", "", 3000);

    var resume_upstream = try http_proxy.TestUpstream.start(allocator, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"ok\":true}");
    defer resume_upstream.deinit();
    const resume_url = try resume_upstream.baseUrl(allocator);
    defer allocator.free(resume_url);
    const lab_resumed = handle(allocator, "POST", "/api/nullboiler/runs/run-shared/resume?boiler_instance=boiler-lab", "{\"state_updates\":{}}", .{
        .boiler_url = resume_url,
        .state = &state,
        .boiler_instance = "boiler-lab",
        .now_ms = 4000,
    });
    defer allocator.free(lab_resumed.body);
    try std.testing.expectEqualStrings("200 OK", lab_resumed.status);
    try std.testing.expect(std.mem.indexOf(u8, resume_upstream.request(), "POST /runs/run-shared/resume HTTP/1.1") != null);

    const ops_still_blocked = handle(allocator, "POST", "/api/nullboiler/runs/run-shared/resume?boiler_instance=boiler-ops", "{\"state_updates\":{}}", .{
        .state = &state,
        .boiler_instance = "boiler-ops",
        .now_ms = 5000,
    });
    defer allocator.free(ops_still_blocked.body);
    try std.testing.expectEqualStrings("423 Locked", ops_still_blocked.status);
    try std.testing.expect(std.mem.indexOf(u8, ops_still_blocked.body, "\"approval_id\":1") != null);
}

test "handle blocks workflow resume until approval is approved" {
    if (comptime @import("builtin").os.tag == .windows) return error.SkipZigTest;

    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    try fixture.paths.ensureDirs();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();
    try state.addInstance("nullboiler", "boiler-a", .{ .version = "1.0.0", .space_id = "ops" });

    _ = try approvals_api.createProducerApproval(&state, .{
        .space_id = "ops",
        .kind = "signature",
        .queue = "workflows",
        .target_ref = "workflow_run:run-1:space:ops:approval:review",
        .title = "Approve workflow run run-1",
        .summary = "Approval node review blocked workflow run run-1.",
        .created_at_ms = 1000,
    }, 1000);

    const blocked = handle(allocator, "POST", "/api/nullboiler/runs/run-1/resume?boiler_instance=boiler-a", "{\"state_updates\":{}}", .{
        .state = &state,
        .boiler_instance = "boiler-a",
        .now_ms = 2000,
    });
    defer allocator.free(blocked.body);
    try std.testing.expectEqualStrings("423 Locked", blocked.status);
    try std.testing.expect(std.mem.indexOf(u8, blocked.body, "\"approval_status\":\"pending\"") != null);

    _ = try state.decideApproval(1, "approved", "", 3000);

    const upstream_body = "{\"ok\":true}";
    const upstream_response = try std.fmt.allocPrint(
        allocator,
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {d}\r\n\r\n{s}",
        .{ upstream_body.len, upstream_body },
    );
    defer allocator.free(upstream_response);
    var upstream = try http_proxy.TestUpstream.start(allocator, upstream_response);
    defer upstream.deinit();
    const base_url = try upstream.baseUrl(allocator);
    defer allocator.free(base_url);

    const resumed = handle(allocator, "POST", "/api/nullboiler/runs/run-1/resume?boiler_instance=boiler-a", "{\"state_updates\":{}}", .{
        .boiler_url = base_url,
        .state = &state,
        .boiler_instance = "boiler-a",
        .now_ms = 4000,
    });
    defer allocator.free(resumed.body);

    try std.testing.expectEqualStrings("200 OK", resumed.status);
    try std.testing.expect(std.mem.indexOf(u8, upstream.request(), "POST /runs/run-1/resume HTTP/1.1") != null);
}
