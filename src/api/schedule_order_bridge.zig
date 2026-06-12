const std = @import("std");
const std_compat = @import("compat");
const durable_file = @import("../core/durable_file.zig");
const orders = @import("../core/orders.zig");
const paths_mod = @import("../core/paths.zig");
const state_mod = @import("../core/state.zig");
const helpers = @import("helpers.zig");

const appendEscaped = helpers.appendEscaped;

const bridge_file_name = "schedule-cron-bridge.json";

pub const CronApi = struct {
    context: ?*anyopaque = null,
    call: *const fn (?*anyopaque, std.mem.Allocator, []const u8, []const u8, []const u8) helpers.ApiResponse,

    fn request(self: CronApi, allocator: std.mem.Allocator, method: []const u8, target: []const u8, body: []const u8) helpers.ApiResponse {
        return self.call(self.context, allocator, method, target, body);
    }
};

const Link = struct {
    order_id: []const u8,
    space_id: []const u8,
    component: []const u8 = "nullclaw",
    instance: []const u8,
    cron_job_id: []const u8,
    last_run_ref: []const u8 = "",
    created_at_ms: i64 = 0,
    updated_at_ms: i64 = 0,

    fn deinit(self: Link, allocator: std.mem.Allocator) void {
        allocator.free(self.order_id);
        allocator.free(self.space_id);
        allocator.free(self.component);
        allocator.free(self.instance);
        allocator.free(self.cron_job_id);
        allocator.free(self.last_run_ref);
    }
};

const LinkTable = struct {
    links: []const Link = &.{},
};

const LoadedLinks = struct {
    allocator: std.mem.Allocator,
    links: []Link,

    fn deinit(self: *LoadedLinks) void {
        for (self.links) |link| link.deinit(self.allocator);
        self.allocator.free(self.links);
        self.* = undefined;
    }
};

pub fn beforeTransition(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    cron_api: ?CronApi,
    order: orders.Order,
    transition: orders.Transition,
    now_ms: i64,
) ?helpers.ApiResponse {
    if (!isScheduleOrder(order)) return null;
    const api = cron_api orelse return null;

    return switch (transition) {
        .activate, .resume_order => ensureCronActive(allocator, paths, state, api, order, now_ms),
        .pause => pauseCron(allocator, paths, api, order),
        .archive => removeCron(allocator, paths, api, order),
        .draft => null,
    };
}

pub fn beforeDelete(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    cron_api: ?CronApi,
    order: orders.Order,
) ?helpers.ApiResponse {
    if (!isScheduleOrder(order)) return null;
    const api = cron_api orelse return null;
    return removeCron(allocator, paths, api, order);
}

pub fn emitExecutedForCronRun(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    component: []const u8,
    instance: []const u8,
    cron_job_id: []const u8,
    run_ref: []const u8,
    now_ms: i64,
) !void {
    if (run_ref.len == 0) return;

    const space_id = instanceSpace(state, component, instance);
    var link = (try findLinkByCronJob(allocator, paths, space_id, component, instance, cron_job_id)) orelse return;
    defer link.deinit(allocator);

    if (std.mem.eql(u8, link.last_run_ref, run_ref)) return;

    const payload_json = try std.json.Stringify.valueAlloc(allocator, .{
        .component = component,
        .instance = instance,
        .cron_job_id = cron_job_id,
        .run_ref = run_ref,
    }, .{});
    defer allocator.free(payload_json);

    _ = try state.addEvent(.{
        .space_id = link.space_id,
        .event_type = "order.executed",
        .source = "cron",
        .subject_type = "order",
        .subject_id = link.order_id,
        .title = "Order executed",
        .summary = "A schedule order cron run completed.",
        .severity = "success",
        .payload_json = payload_json,
        .created_at_ms = now_ms,
    });

    try upsertLink(allocator, paths, .{
        .order_id = link.order_id,
        .space_id = link.space_id,
        .component = link.component,
        .instance = link.instance,
        .cron_job_id = link.cron_job_id,
        .last_run_ref = run_ref,
        .created_at_ms = link.created_at_ms,
        .updated_at_ms = now_ms,
    });
    try state.save();
}

fn ensureCronActive(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    cron_api: CronApi,
    order: orders.Order,
    now_ms: i64,
) ?helpers.ApiResponse {
    if (std.mem.trim(u8, order.schedule, &std.ascii.whitespace).len == 0) {
        return helpers.badRequest("{\"error\":\"schedule order requires schedule\"}");
    }

    if (findLinkByOrder(allocator, paths, order.space_id, order.id) catch return helpers.serverError()) |existing| {
        defer existing.deinit(allocator);
        if (runCronAction(allocator, cron_api, existing.component, existing.instance, existing.cron_job_id, "resume")) |resp| {
            if (!isNotFoundStatus(resp.status)) return resp;
            removeLink(allocator, paths, order.space_id, order.id) catch return helpers.serverError();
        } else {
            return null;
        }
    }

    return createCronForOrder(allocator, paths, state, cron_api, order, now_ms);
}

fn createCronForOrder(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    cron_api: CronApi,
    order: orders.Order,
    now_ms: i64,
) ?helpers.ApiResponse {
    const instance = resolveNullclawInstance(allocator, state, order.space_id) catch return helpers.serverError();
    if (instance == null) return helpers.badRequest("{\"error\":\"no nullclaw instance found for order space\"}");
    defer allocator.free(instance.?);

    const target = cronTargetAlloc(allocator, "nullclaw", instance.?, "") catch return helpers.serverError();
    defer allocator.free(target);
    const body = buildCreateBody(allocator, order) catch return helpers.serverError();
    defer allocator.free(body);

    const resp = cron_api.request(allocator, "POST", target, body);
    if (!isSuccessStatus(resp.status)) return resp;
    defer allocator.free(resp.body);

    const cron_job_id = parseCreatedJobId(allocator, resp.body) catch return helpers.serverError();
    defer allocator.free(cron_job_id);

    upsertLink(allocator, paths, .{
        .order_id = order.id,
        .space_id = order.space_id,
        .component = "nullclaw",
        .instance = instance.?,
        .cron_job_id = cron_job_id,
        .created_at_ms = now_ms,
        .updated_at_ms = now_ms,
    }) catch return helpers.serverError();

    return null;
}

fn pauseCron(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    cron_api: CronApi,
    order: orders.Order,
) ?helpers.ApiResponse {
    const link = (findLinkByOrder(allocator, paths, order.space_id, order.id) catch return helpers.serverError()) orelse return null;
    defer link.deinit(allocator);

    return runCronAction(allocator, cron_api, link.component, link.instance, link.cron_job_id, "pause");
}

fn removeCron(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    cron_api: CronApi,
    order: orders.Order,
) ?helpers.ApiResponse {
    const link = (findLinkByOrder(allocator, paths, order.space_id, order.id) catch return helpers.serverError()) orelse return null;
    defer link.deinit(allocator);

    if (runCronAction(allocator, cron_api, link.component, link.instance, link.cron_job_id, "remove")) |resp| {
        if (!isNotFoundStatus(resp.status)) return resp;
    }
    removeLink(allocator, paths, order.space_id, order.id) catch return helpers.serverError();
    return null;
}

fn runCronAction(
    allocator: std.mem.Allocator,
    cron_api: CronApi,
    component: []const u8,
    instance: []const u8,
    cron_job_id: []const u8,
    action: []const u8,
) ?helpers.ApiResponse {
    const target = if (std.mem.eql(u8, action, "remove"))
        cronTargetAlloc(allocator, component, instance, cron_job_id)
    else
        cronActionTargetAlloc(allocator, component, instance, cron_job_id, action);
    const owned_target = target catch return helpers.serverError();
    defer allocator.free(owned_target);

    const method = if (std.mem.eql(u8, action, "remove")) "DELETE" else "POST";
    const resp = cron_api.request(allocator, method, owned_target, "");
    if (!isSuccessStatus(resp.status)) return resp;
    allocator.free(resp.body);
    return null;
}

fn isScheduleOrder(order: orders.Order) bool {
    return std.mem.eql(u8, order.kind, "schedule");
}

fn resolveNullclawInstance(allocator: std.mem.Allocator, state: *state_mod.State, space_id: []const u8) !?[]u8 {
    const names = (try state.instanceNames("nullclaw")) orelse return null;
    defer allocator.free(names);

    var selected: ?[]const u8 = null;
    for (names) |name| {
        const entry = state.getInstance("nullclaw", name) orelse continue;
        if (!state.spaceMatches(entry.space_id, space_id)) continue;
        if (std.mem.eql(u8, name, "default")) return try allocator.dupe(u8, name);
        if (selected == null or std.mem.order(u8, name, selected.?) == .lt) selected = name;
    }

    return if (selected) |name| try allocator.dupe(u8, name) else null;
}

fn instanceSpace(state: *state_mod.State, component: []const u8, instance: []const u8) []const u8 {
    if (state.getInstance(component, instance)) |entry| {
        if (entry.space_id.len > 0) return entry.space_id;
    }
    return "default";
}

fn buildCreateBody(allocator: std.mem.Allocator, order: orders.Order) ![]const u8 {
    const raw_prompt = if (std.mem.trim(u8, order.content, &std.ascii.whitespace).len > 0) order.content else order.title;
    return std.json.Stringify.valueAlloc(allocator, .{
        .expression = order.schedule,
        .prompt = raw_prompt,
        .session_target = order.id,
    }, .{});
}

fn parseCreatedJobId(allocator: std.mem.Allocator, body: []const u8) ![]u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{ .allocate = .alloc_always });
    defer parsed.deinit();
    if (parsed.value != .object) return error.InvalidCronResponse;
    const job = parsed.value.object.get("job") orelse return error.InvalidCronResponse;
    if (job != .object) return error.InvalidCronResponse;
    const id = job.object.get("id") orelse return error.InvalidCronResponse;
    if (id != .string or id.string.len == 0) return error.InvalidCronResponse;
    return allocator.dupe(u8, id.string);
}

fn cronTargetAlloc(allocator: std.mem.Allocator, component: []const u8, instance: []const u8, job_id: []const u8) ![]u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();

    try buf.appendSlice("/api/instances/");
    try appendPathSegment(&buf, component);
    try buf.append('/');
    try appendPathSegment(&buf, instance);
    try buf.appendSlice("/cron");
    if (job_id.len > 0) {
        try buf.append('/');
        try appendPathSegment(&buf, job_id);
    }
    return buf.toOwnedSlice();
}

fn cronActionTargetAlloc(allocator: std.mem.Allocator, component: []const u8, instance: []const u8, job_id: []const u8, action: []const u8) ![]u8 {
    const base = try cronTargetAlloc(allocator, component, instance, job_id);
    defer allocator.free(base);
    return std.fmt.allocPrint(allocator, "{s}/{s}", .{ base, action });
}

fn appendPathSegment(buf: *std.array_list.Managed(u8), value: []const u8) !void {
    const hex = "0123456789ABCDEF";
    for (value) |byte| {
        const safe = (byte >= 'a' and byte <= 'z') or
            (byte >= 'A' and byte <= 'Z') or
            (byte >= '0' and byte <= '9') or
            byte == '-' or byte == '_' or byte == '.' or byte == '~';
        if (safe) {
            try buf.append(byte);
        } else {
            try buf.append('%');
            try buf.append(hex[byte >> 4]);
            try buf.append(hex[byte & 0x0f]);
        }
    }
}

fn isSuccessStatus(status: []const u8) bool {
    return status.len >= 3 and status[0] == '2' and std.ascii.isDigit(status[1]) and std.ascii.isDigit(status[2]);
}

fn isNotFoundStatus(status: []const u8) bool {
    return std.mem.eql(u8, status, "404 Not Found");
}

fn bridgePath(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8) ![]const u8 {
    return std.fs.path.join(allocator, &.{ paths.root, "spaces", space_id, "orders", bridge_file_name });
}

fn ensureOrdersDir(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8) !void {
    const dir_path = try paths.spaceOrdersDir(allocator, space_id);
    defer allocator.free(dir_path);
    try makeAbsolutePath(dir_path);
}

fn loadLinks(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8) !LoadedLinks {
    const path = try bridgePath(allocator, paths, space_id);
    defer allocator.free(path);

    const raw = blk: {
        const file = std_compat.fs.openFileAbsolute(path, .{}) catch |err| switch (err) {
            error.FileNotFound => {
                const empty = try allocator.alloc(Link, 0);
                return .{ .allocator = allocator, .links = empty };
            },
            else => return err,
        };
        defer file.close();
        break :blk try file.readToEndAlloc(allocator, 1024 * 1024);
    };
    defer allocator.free(raw);

    const parsed = try std.json.parseFromSlice(LinkTable, allocator, raw, .{
        .allocate = .alloc_always,
        .ignore_unknown_fields = true,
    });
    defer parsed.deinit();

    const links = try allocator.alloc(Link, parsed.value.links.len);
    errdefer allocator.free(links);
    for (parsed.value.links, 0..) |link, idx| {
        links[idx] = try cloneLink(allocator, link);
    }
    return .{ .allocator = allocator, .links = links };
}

fn saveLinks(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, links: []const Link) !void {
    try ensureOrdersDir(allocator, paths, space_id);
    const path = try bridgePath(allocator, paths, space_id);
    defer allocator.free(path);

    const bytes = try std.json.Stringify.valueAlloc(allocator, LinkTable{ .links = links }, .{
        .whitespace = .indent_2,
    });
    defer allocator.free(bytes);
    try durable_file.writeTextFileAtomically(allocator, path, bytes);
}

fn upsertLink(allocator: std.mem.Allocator, paths: paths_mod.Paths, input: Link) !void {
    var loaded = try loadLinks(allocator, paths, input.space_id);
    defer loaded.deinit();

    var replaced = false;
    var result = try allocator.alloc(Link, loaded.links.len + 1);
    var filled: usize = 0;
    errdefer {
        for (result[0..filled]) |link| link.deinit(allocator);
        allocator.free(result);
    }

    for (loaded.links) |existing| {
        if (std.mem.eql(u8, existing.order_id, input.order_id)) {
            result[filled] = try cloneLink(allocator, input);
            replaced = true;
        } else {
            result[filled] = try cloneLink(allocator, existing);
        }
        filled += 1;
    }
    if (!replaced) {
        result[filled] = try cloneLink(allocator, input);
        filled += 1;
    }

    try saveLinks(allocator, paths, input.space_id, result[0..filled]);
    for (result[0..filled]) |link| link.deinit(allocator);
    allocator.free(result);
}

fn removeLink(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, order_id: []const u8) !void {
    var loaded = try loadLinks(allocator, paths, space_id);
    defer loaded.deinit();

    var result = try allocator.alloc(Link, loaded.links.len);
    var filled: usize = 0;
    errdefer {
        for (result[0..filled]) |link| link.deinit(allocator);
        allocator.free(result);
    }

    for (loaded.links) |existing| {
        if (std.mem.eql(u8, existing.order_id, order_id)) continue;
        result[filled] = try cloneLink(allocator, existing);
        filled += 1;
    }

    try saveLinks(allocator, paths, space_id, result[0..filled]);
    for (result[0..filled]) |link| link.deinit(allocator);
    allocator.free(result);
}

fn findLinkByOrder(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, order_id: []const u8) !?Link {
    var loaded = try loadLinks(allocator, paths, space_id);
    defer loaded.deinit();
    for (loaded.links) |link| {
        if (std.mem.eql(u8, link.order_id, order_id)) return try cloneLink(allocator, link);
    }
    return null;
}

fn findLinkByCronJob(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    space_id: []const u8,
    component: []const u8,
    instance: []const u8,
    cron_job_id: []const u8,
) !?Link {
    var loaded = try loadLinks(allocator, paths, space_id);
    defer loaded.deinit();
    for (loaded.links) |link| {
        if (std.mem.eql(u8, link.component, component) and
            std.mem.eql(u8, link.instance, instance) and
            std.mem.eql(u8, link.cron_job_id, cron_job_id))
        {
            return try cloneLink(allocator, link);
        }
    }
    return null;
}

fn cloneLink(allocator: std.mem.Allocator, link: Link) !Link {
    return .{
        .order_id = try allocator.dupe(u8, link.order_id),
        .space_id = try allocator.dupe(u8, link.space_id),
        .component = try allocator.dupe(u8, if (link.component.len > 0) link.component else "nullclaw"),
        .instance = try allocator.dupe(u8, link.instance),
        .cron_job_id = try allocator.dupe(u8, link.cron_job_id),
        .last_run_ref = try allocator.dupe(u8, link.last_run_ref),
        .created_at_ms = link.created_at_ms,
        .updated_at_ms = link.updated_at_ms,
    };
}

fn makeAbsolutePath(path: []const u8) !void {
    std_compat.fs.makeDirAbsolute(path) catch |err| switch (err) {
        error.PathAlreadyExists => {},
        error.FileNotFound => {
            const parent = std.fs.path.dirname(path) orelse return err;
            try makeAbsolutePath(parent);
            try std_compat.fs.makeDirAbsolute(path);
        },
        else => return err,
    };
}

const MockCall = struct {
    method: []const u8,
    target: []const u8,
    body: []const u8,

    fn deinit(self: MockCall, allocator: std.mem.Allocator) void {
        allocator.free(self.method);
        allocator.free(self.target);
        allocator.free(self.body);
    }
};

const MockCronApi = struct {
    calls: std.array_list.Managed(MockCall),
    next_job_id: []const u8 = "job-42",
    missing_job_id: []const u8 = "",

    fn init(allocator: std.mem.Allocator) MockCronApi {
        return .{ .calls = std.array_list.Managed(MockCall).init(allocator) };
    }

    fn deinit(self: *MockCronApi) void {
        for (self.calls.items) |recorded_call| recorded_call.deinit(self.calls.allocator);
        self.calls.deinit();
    }

    fn api(self: *MockCronApi) CronApi {
        return .{ .context = self, .call = call };
    }

    fn call(ctx: ?*anyopaque, allocator: std.mem.Allocator, method: []const u8, target: []const u8, body: []const u8) helpers.ApiResponse {
        const self: *MockCronApi = @ptrCast(@alignCast(ctx.?));
        self.calls.append(.{
            .method = allocator.dupe(u8, method) catch @panic("OOM"),
            .target = allocator.dupe(u8, target) catch @panic("OOM"),
            .body = allocator.dupe(u8, body) catch @panic("OOM"),
        }) catch @panic("OOM");

        if (self.missing_job_id.len > 0 and std.mem.indexOf(u8, target, self.missing_job_id) != null) {
            if ((std.mem.eql(u8, method, "POST") and std.mem.endsWith(u8, target, "/resume")) or
                std.mem.eql(u8, method, "DELETE"))
            {
                return helpers.notFound();
            }
        }
        if (std.mem.eql(u8, method, "POST") and std.mem.endsWith(u8, target, "/cron")) {
            const response = std.fmt.allocPrint(allocator, "{{\"job\":{{\"id\":\"{s}\"}}}}", .{self.next_job_id}) catch @panic("OOM");
            return helpers.jsonOk(response);
        }
        if (std.mem.eql(u8, method, "POST") and std.mem.endsWith(u8, target, "/pause")) {
            return helpers.jsonOk(allocator.dupe(u8, "{\"status\":\"paused\"}") catch @panic("OOM"));
        }
        if (std.mem.eql(u8, method, "POST") and std.mem.endsWith(u8, target, "/resume")) {
            return helpers.jsonOk(allocator.dupe(u8, "{\"status\":\"resumed\"}") catch @panic("OOM"));
        }
        if (std.mem.eql(u8, method, "DELETE")) {
            return helpers.jsonOk(allocator.dupe(u8, "{\"status\":\"deleted\"}") catch @panic("OOM"));
        }
        return helpers.notFound();
    }
};

fn scheduleOrder() orders.Order {
    return .{
        .id = "order-1",
        .space_id = "ops",
        .title = "Morning report",
        .summary = "",
        .kind = "schedule",
        .status = "draft",
        .schedule = "0 9 * * *",
        .doc_path = "orders/order-1.md",
        .content = "# Brief\nSend the morning report.",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    };
}

test "schedule order bridge enact creates cron through instance API" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();
    try state.addInstance("nullclaw", "my-agent", .{ .version = "1.0.0", .space_id = "ops" });

    var mock = MockCronApi.init(allocator);
    defer mock.deinit();
    const maybe_resp = beforeTransition(allocator, fixture.paths, &state, mock.api(), scheduleOrder(), .activate, 2000);
    try std.testing.expect(maybe_resp == null);

    try std.testing.expectEqual(@as(usize, 1), mock.calls.items.len);
    try std.testing.expectEqualStrings("POST", mock.calls.items[0].method);
    try std.testing.expectEqualStrings("/api/instances/nullclaw/my-agent/cron", mock.calls.items[0].target);
    try std.testing.expect(std.mem.indexOf(u8, mock.calls.items[0].body, "\"expression\":\"0 9 * * *\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, mock.calls.items[0].body, "\"prompt\":\"# Brief\\nSend the morning report.\"") != null);

    const link = (try findLinkByOrder(allocator, fixture.paths, "ops", "order-1")).?;
    defer link.deinit(allocator);
    try std.testing.expectEqualStrings("job-42", link.cron_job_id);
    try std.testing.expectEqualStrings("my-agent", link.instance);
}

test "schedule order bridge recreates stale cron link on enact" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();
    try state.addInstance("nullclaw", "my-agent", .{ .version = "1.0.0", .space_id = "ops" });

    try upsertLink(allocator, fixture.paths, .{
        .order_id = "order-1",
        .space_id = "ops",
        .component = "nullclaw",
        .instance = "my-agent",
        .cron_job_id = "job-stale",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });

    var mock = MockCronApi.init(allocator);
    defer mock.deinit();
    mock.missing_job_id = "job-stale";
    mock.next_job_id = "job-recreated";

    try std.testing.expect(beforeTransition(allocator, fixture.paths, &state, mock.api(), scheduleOrder(), .activate, 2000) == null);
    try std.testing.expectEqual(@as(usize, 2), mock.calls.items.len);
    try std.testing.expectEqualStrings("POST", mock.calls.items[0].method);
    try std.testing.expectEqualStrings("/api/instances/nullclaw/my-agent/cron/job-stale/resume", mock.calls.items[0].target);
    try std.testing.expectEqualStrings("POST", mock.calls.items[1].method);
    try std.testing.expectEqualStrings("/api/instances/nullclaw/my-agent/cron", mock.calls.items[1].target);

    const link = (try findLinkByOrder(allocator, fixture.paths, "ops", "order-1")).?;
    defer link.deinit(allocator);
    try std.testing.expectEqualStrings("job-recreated", link.cron_job_id);
    try std.testing.expectEqualStrings("", link.last_run_ref);
}

test "schedule order bridge archive clears stale cron link idempotently" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();
    try state.addInstance("nullclaw", "my-agent", .{ .version = "1.0.0", .space_id = "ops" });

    try upsertLink(allocator, fixture.paths, .{
        .order_id = "order-1",
        .space_id = "ops",
        .component = "nullclaw",
        .instance = "my-agent",
        .cron_job_id = "job-stale",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });

    var mock = MockCronApi.init(allocator);
    defer mock.deinit();
    mock.missing_job_id = "job-stale";

    try std.testing.expect(beforeTransition(allocator, fixture.paths, &state, mock.api(), scheduleOrder(), .archive, 2000) == null);
    try std.testing.expectEqual(@as(usize, 1), mock.calls.items.len);
    try std.testing.expectEqualStrings("DELETE", mock.calls.items[0].method);
    try std.testing.expectEqualStrings("/api/instances/nullclaw/my-agent/cron/job-stale", mock.calls.items[0].target);
    try std.testing.expect((try findLinkByOrder(allocator, fixture.paths, "ops", "order-1")) == null);

    try std.testing.expect(beforeTransition(allocator, fixture.paths, &state, mock.api(), scheduleOrder(), .archive, 3000) == null);
    try std.testing.expectEqual(@as(usize, 1), mock.calls.items.len);
}

test "schedule order bridge suspend pauses and archive removes cron" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();
    try state.addInstance("nullclaw", "my-agent", .{ .version = "1.0.0", .space_id = "ops" });

    try upsertLink(allocator, fixture.paths, .{
        .order_id = "order-1",
        .space_id = "ops",
        .component = "nullclaw",
        .instance = "my-agent",
        .cron_job_id = "job-42",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });

    var mock = MockCronApi.init(allocator);
    defer mock.deinit();

    try std.testing.expect(beforeTransition(allocator, fixture.paths, &state, mock.api(), scheduleOrder(), .pause, 2000) == null);
    try std.testing.expectEqual(@as(usize, 1), mock.calls.items.len);
    try std.testing.expectEqualStrings("POST", mock.calls.items[0].method);
    try std.testing.expectEqualStrings("/api/instances/nullclaw/my-agent/cron/job-42/pause", mock.calls.items[0].target);
    const paused_link = (try findLinkByOrder(allocator, fixture.paths, "ops", "order-1")).?;
    paused_link.deinit(allocator);

    try std.testing.expect(beforeTransition(allocator, fixture.paths, &state, mock.api(), scheduleOrder(), .archive, 3000) == null);
    try std.testing.expectEqual(@as(usize, 2), mock.calls.items.len);
    try std.testing.expectEqualStrings("DELETE", mock.calls.items[1].method);
    try std.testing.expectEqualStrings("/api/instances/nullclaw/my-agent/cron/job-42", mock.calls.items[1].target);
    try std.testing.expect((try findLinkByOrder(allocator, fixture.paths, "ops", "order-1")) == null);
}

test "schedule order bridge emits order executed event with run ref" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();
    try state.addInstance("nullclaw", "my-agent", .{ .version = "1.0.0", .space_id = "ops" });

    try upsertLink(allocator, fixture.paths, .{
        .order_id = "order-1",
        .space_id = "ops",
        .component = "nullclaw",
        .instance = "my-agent",
        .cron_job_id = "job-42",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });

    try emitExecutedForCronRun(allocator, fixture.paths, &state, "nullclaw", "my-agent", "job-42", "run-99", 4000);
    try std.testing.expectEqual(@as(usize, 1), state.eventsList().len);
    const event = state.eventsList()[0];
    try std.testing.expectEqualStrings("order.executed", event.event_type);
    try std.testing.expectEqualStrings("cron", event.source);
    try std.testing.expectEqualStrings("order", event.subject_type);
    try std.testing.expectEqualStrings("order-1", event.subject_id);
    try std.testing.expect(std.mem.indexOf(u8, event.payload_json, "\"cron_job_id\":\"job-42\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, event.payload_json, "\"run_ref\":\"run-99\"") != null);

    try emitExecutedForCronRun(allocator, fixture.paths, &state, "nullclaw", "my-agent", "job-42", "run-99", 5000);
    try std.testing.expectEqual(@as(usize, 1), state.eventsList().len);

    const link = (try findLinkByOrder(allocator, fixture.paths, "ops", "order-1")).?;
    defer link.deinit(allocator);
    try std.testing.expectEqualStrings("run-99", link.last_run_ref);
}
