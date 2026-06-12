const std = @import("std");
const builtin = @import("builtin");
const std_compat = @import("compat");
const managed_cli = @import("../api/managed_cli.zig");
const durable_file = @import("../core/durable_file.zig");
const orders_mod = @import("../core/orders.zig");
const paths_mod = @import("../core/paths.zig");
const state_mod = @import("../core/state.zig");
const spaces_api = @import("../api/spaces.zig");
const test_helpers = @import("../test_helpers.zig");

pub const source = "nullhub.dispatcher";
pub const default_interval_ms: u64 = 1000;

const Cursor = struct {
    last_event_id: u64 = 0,
    updated_at_ms: i64 = 0,
};

pub const Tier = enum {
    t0,
    t1,
    t2,

    fn fromString(value: []const u8) ?Tier {
        if (std.ascii.eqlIgnoreCase(value, "T0") or std.mem.eql(u8, value, "0")) return .t0;
        if (std.ascii.eqlIgnoreCase(value, "T1") or std.mem.eql(u8, value, "1")) return .t1;
        if (std.ascii.eqlIgnoreCase(value, "T2") or std.mem.eql(u8, value, "2")) return .t2;
        return null;
    }

    pub fn string(self: Tier) []const u8 {
        return switch (self) {
            .t0 => "T0",
            .t1 => "T1",
            .t2 => "T2",
        };
    }
};

pub const ActionKind = enum {
    create_ticket,
    start_loop,
    start_workflow,
    run_agent,

    fn fromString(value: []const u8) ?ActionKind {
        if (std.ascii.eqlIgnoreCase(value, "create_ticket") or
            std.ascii.eqlIgnoreCase(value, "ticket") or
            std.ascii.eqlIgnoreCase(value, "tickets.create"))
        {
            return .create_ticket;
        }
        if (std.ascii.eqlIgnoreCase(value, "start_loop") or
            std.ascii.eqlIgnoreCase(value, "loop") or
            std.ascii.eqlIgnoreCase(value, "loops.start"))
        {
            return .start_loop;
        }
        if (std.ascii.eqlIgnoreCase(value, "start_workflow") or
            std.ascii.eqlIgnoreCase(value, "workflow") or
            std.ascii.eqlIgnoreCase(value, "workflows.start"))
        {
            return .start_workflow;
        }
        if (std.ascii.eqlIgnoreCase(value, "run_agent") or
            std.ascii.eqlIgnoreCase(value, "agent") or
            std.ascii.eqlIgnoreCase(value, "agents.run"))
        {
            return .run_agent;
        }
        return null;
    }

    pub fn string(self: ActionKind) []const u8 {
        return switch (self) {
            .create_ticket => "create_ticket",
            .start_loop => "start_loop",
            .start_workflow => "start_workflow",
            .run_agent => "run_agent",
        };
    }
};

pub const TriggerSpec = struct {
    event_type: []const u8,
    source: ?[]const u8 = null,
    subject_type: ?[]const u8 = null,
    subject_id: ?[]const u8 = null,
    tier: Tier = .t1,
    action: ActionKind,
    target: ?[]const u8 = null,
    instructions: ?[]const u8 = null,
};

const ParsedTriggerSpec = struct {
    tree: ?std.json.Parsed(std.json.Value) = null,
    spec: TriggerSpec,

    fn deinit(self: *ParsedTriggerSpec) void {
        if (self.tree) |*tree| tree.deinit();
        self.* = undefined;
    }
};

pub const DispatchContext = struct {
    paths: paths_mod.Paths,
    order: orders_mod.Order,
    event: state_mod.Event,
    spec: TriggerSpec,
    idempotency_key: []const u8,
    now_ms: i64,
};

pub const ExecutionOutcome = struct {
    succeeded: bool,
};

pub const Executors = struct {
    pub const ExecFn = *const fn (?*anyopaque, std.mem.Allocator, *state_mod.State, DispatchContext) anyerror!ExecutionOutcome;

    ptr: ?*anyopaque = null,
    create_ticket: ExecFn = defaultCreateTicket,
    start_loop: ExecFn = defaultStartLoop,
    start_workflow: ExecFn = defaultStartWorkflow,
    run_agent: ExecFn = defaultRunAgent,

    fn execute(self: Executors, allocator: std.mem.Allocator, state: *state_mod.State, ctx: DispatchContext) !ExecutionOutcome {
        return switch (ctx.spec.action) {
            .create_ticket => try self.create_ticket(self.ptr, allocator, state, ctx),
            .start_loop => try self.start_loop(self.ptr, allocator, state, ctx),
            .start_workflow => try self.start_workflow(self.ptr, allocator, state, ctx),
            .run_agent => try self.run_agent(self.ptr, allocator, state, ctx),
        };
    }
};

fn defaultCreateTicket(_: ?*anyopaque, allocator: std.mem.Allocator, state: *state_mod.State, ctx: DispatchContext) !ExecutionOutcome {
    return appendWorkRun(allocator, state, ctx, .{
        .kind = "ticket",
        .status = "created",
        .event_type = "work.ticket.created",
        .severity = "success",
        .title_prefix = "Ticket work run created",
        .summary = "Dispatcher created a durable ticket work run.",
    });
}

fn defaultStartLoop(_: ?*anyopaque, allocator: std.mem.Allocator, state: *state_mod.State, ctx: DispatchContext) !ExecutionOutcome {
    return appendWorkRun(allocator, state, ctx, .{
        .kind = "loop",
        .status = "running",
        .event_type = "work.loop.started",
        .severity = "success",
        .title_prefix = "Loop run started",
        .summary = "Dispatcher started a durable loop work run.",
    });
}

fn defaultStartWorkflow(_: ?*anyopaque, allocator: std.mem.Allocator, state: *state_mod.State, ctx: DispatchContext) !ExecutionOutcome {
    return appendWorkRun(allocator, state, ctx, .{
        .kind = "workflow",
        .status = "running",
        .event_type = "work.workflow.started",
        .severity = "success",
        .title_prefix = "Workflow run started",
        .summary = "Dispatcher started a durable workflow work run.",
    });
}

fn defaultRunAgent(_: ?*anyopaque, allocator: std.mem.Allocator, state: *state_mod.State, ctx: DispatchContext) !ExecutionOutcome {
    if (builtin.os.tag == .windows) {
        return appendWorkRun(allocator, state, ctx, .{
            .kind = "agent",
            .status = "failed",
            .event_type = "work.agent.failed",
            .severity = "error",
            .title_prefix = "Agent run unsupported",
            .summary = "Dispatcher agent execution is unsupported on this platform.",
        });
    }

    const instance_name = ctx.spec.target orelse {
        return appendWorkRun(allocator, state, ctx, .{
            .kind = "agent",
            .status = "failed",
            .event_type = "work.agent.failed",
            .severity = "error",
            .title_prefix = "Agent run missing target",
            .summary = "Dispatcher agent execution requires a NullClaw instance target.",
        });
    };
    const clean_instance = stripComponentPrefix(instance_name, "nullclaw/");
    const message = ctx.spec.instructions orelse ctx.order.summary;
    const effective_message = if (message.len > 0) message else ctx.order.title;
    const args = [_][]const u8{
        "agent",
        "invoke",
        "--message",
        effective_message,
        "--session",
        ctx.idempotency_key,
        "--json",
    };
    const captured = managed_cli.capture(allocator, state, ctx.paths, "nullclaw", clean_instance, args[0..]);
    switch (captured) {
        .response => |resp| {
            defer if (std.mem.eql(u8, resp.status, "502 Bad Gateway")) allocator.free(resp.body);
            const summary = try std.fmt.allocPrint(allocator, "NullClaw agent invocation failed before execution: {s}.", .{resp.status});
            defer allocator.free(summary);
            return appendWorkRun(allocator, state, ctx, .{
                .kind = "agent",
                .status = "failed",
                .event_type = "work.agent.failed",
                .severity = "error",
                .title_prefix = "Agent run failed",
                .summary = summary,
            });
        },
        .result => |result| {
            defer allocator.free(result.stdout);
            defer allocator.free(result.stderr);
            if (!result.success) {
                const summary = try std.fmt.allocPrint(allocator, "NullClaw agent invocation failed: {s}", .{firstOutputLine(result.stderr, result.stdout)});
                defer allocator.free(summary);
                return appendWorkRun(allocator, state, ctx, .{
                    .kind = "agent",
                    .status = "failed",
                    .event_type = "work.agent.failed",
                    .severity = "error",
                    .title_prefix = "Agent run failed",
                    .summary = summary,
                });
            }
            return appendWorkRun(allocator, state, ctx, .{
                .kind = "agent",
                .status = "completed",
                .event_type = "work.agent.completed",
                .severity = "success",
                .title_prefix = "Agent run completed",
                .summary = "Dispatcher completed a NullClaw agent run.",
                .evidence_ref = ctx.idempotency_key,
            });
        },
    }
}

pub const RunOptions = struct {
    executors: Executors = .{},
    save_cursor: bool = true,
};

pub const RunResult = struct {
    cursor_before: u64 = 0,
    cursor_after: u64 = 0,
    seen_events: usize = 0,
    matched_orders: usize = 0,
    executed: usize = 0,
    failed: usize = 0,
    approvals_created: usize = 0,
    skipped_idempotent: usize = 0,
};

pub const Poller = struct {
    allocator: std.mem.Allocator = undefined,
    paths: paths_mod.Paths = .{ .root = "" },
    state: ?*state_mod.State = null,
    mutex: ?*std_compat.sync.Mutex = null,
    interval_ms: u64 = default_interval_ms,
    executors: Executors = .{},
    stop_requested: std.atomic.Value(bool) = std.atomic.Value(bool).init(false),
    thread: ?std.Thread = null,

    pub fn start(
        self: *Poller,
        allocator: std.mem.Allocator,
        paths: paths_mod.Paths,
        state: *state_mod.State,
        mutex: *std_compat.sync.Mutex,
        interval_ms: u64,
        executors: Executors,
    ) !void {
        if (self.thread != null) return;
        self.allocator = allocator;
        self.paths = paths;
        self.state = state;
        self.mutex = mutex;
        self.interval_ms = if (interval_ms == 0) default_interval_ms else interval_ms;
        self.executors = executors;
        self.stop_requested.store(false, .release);
        self.thread = try std.Thread.spawn(.{}, pollerLoop, .{self});
    }

    pub fn stop(self: *Poller) void {
        self.stop_requested.store(true, .release);
        if (self.thread) |thread| {
            thread.join();
            self.thread = null;
        }
    }

    fn pollerLoop(self: *Poller) void {
        while (!self.stop_requested.load(.acquire)) {
            if (self.state) |state| {
                if (self.mutex) |mutex| {
                    mutex.lock();
                    _ = runOnce(self.allocator, self.paths, state, std_compat.time.milliTimestamp(), .{
                        .executors = self.executors,
                    }) catch |err| {
                        std.log.err("dispatcher tick failed: {s}", .{@errorName(err)});
                    };
                    mutex.unlock();
                }
            }
            self.sleepInterruptibly();
        }
    }

    fn sleepInterruptibly(self: *Poller) void {
        var slept: u64 = 0;
        const total_ns = self.interval_ms * std.time.ns_per_ms;
        const step_ns = @min(total_ns, 50 * std.time.ns_per_ms);
        while (slept < total_ns and !self.stop_requested.load(.acquire)) {
            std_compat.thread.sleep(step_ns);
            slept += step_ns;
        }
    }
};

pub fn runOnce(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    now_ms: i64,
    options: RunOptions,
) !RunResult {
    var cursor = try loadCursor(allocator, paths);
    var result = RunResult{
        .cursor_before = cursor.last_event_id,
        .cursor_after = cursor.last_event_id,
    };

    const events = state.eventsList();
    const snapshot = try allocator.alloc(state_mod.Event, events.len);
    defer allocator.free(snapshot);
    @memcpy(snapshot, events);

    var mutated_state = false;
    for (snapshot) |event| {
        if (event.id <= cursor.last_event_id) continue;
        result.seen_events += 1;
        result.cursor_after = @max(result.cursor_after, event.id);

        if (std.mem.eql(u8, event.source, source)) continue;
        if (!spaces_api.isValidSpaceId(event.space_id)) continue;

        const space_orders = try orders_mod.list(allocator, paths, event.space_id);
        defer freeOrders(allocator, space_orders);

        for (space_orders) |order| {
            if (!isActiveTriggerOrder(order)) continue;

            var parsed_spec = parseTriggerSpec(allocator, order) catch continue;
            defer parsed_spec.deinit();
            if (!matchesEvent(parsed_spec.spec, event)) continue;
            result.matched_orders += 1;

            if (try hasDispatchRecord(allocator, state.eventsList(), order.id, event.id)) {
                result.skipped_idempotent += 1;
                continue;
            }

            const key = try dispatchKey(allocator, order.id, event.id);
            defer allocator.free(key);
            const ctx = DispatchContext{
                .paths = paths,
                .order = order,
                .event = event,
                .spec = parsed_spec.spec,
                .idempotency_key = key,
                .now_ms = now_ms,
            };

            switch (parsed_spec.spec.tier) {
                .t0 => {
                    const outcome = try options.executors.execute(allocator, state, ctx);
                    if (outcome.succeeded) {
                        try appendDispatchRecord(allocator, state, order, event, parsed_spec.spec, null, "dispatcher.executed", now_ms);
                        result.executed += 1;
                    } else {
                        try appendDispatchRecord(allocator, state, order, event, parsed_spec.spec, null, "dispatcher.failed", now_ms);
                        result.failed += 1;
                    }
                    mutated_state = true;
                },
                .t1, .t2 => {
                    const approval = try ensureApproval(allocator, state, order, event, parsed_spec.spec, now_ms);
                    try appendDispatchRecord(allocator, state, order, event, parsed_spec.spec, approval.id, "dispatcher.approval_requested", now_ms);
                    result.approvals_created += 1;
                    mutated_state = true;
                },
            }
        }
    }

    if (mutated_state) try state.save();
    if (options.save_cursor and result.cursor_after != cursor.last_event_id) {
        cursor.last_event_id = result.cursor_after;
        cursor.updated_at_ms = now_ms;
        try saveCursor(allocator, paths, cursor);
    }
    return result;
}

fn freeOrders(allocator: std.mem.Allocator, orders: []orders_mod.Order) void {
    for (orders) |order| order.deinit(allocator);
    allocator.free(orders);
}

fn isActiveTriggerOrder(order: orders_mod.Order) bool {
    return std.mem.eql(u8, order.kind, "trigger") and std.mem.eql(u8, order.status, "active");
}

fn parseTriggerSpec(allocator: std.mem.Allocator, order: orders_mod.Order) !ParsedTriggerSpec {
    const trimmed_content = std.mem.trim(u8, order.content, &std.ascii.whitespace);
    if (trimmed_content.len > 0 and trimmed_content[0] == '{') {
        var tree = try std.json.parseFromSlice(std.json.Value, allocator, trimmed_content, .{
            .allocate = .alloc_always,
        });
        errdefer tree.deinit();
        const root = switch (tree.value) {
            .object => |obj| obj,
            else => return error.InvalidTriggerSpec,
        };
        const spec = parseTriggerSpecObject(root) orelse return error.InvalidTriggerSpec;
        return .{ .tree = tree, .spec = spec };
    }

    if (std.mem.startsWith(u8, order.schedule, "event:")) {
        const event_type = std.mem.trim(u8, order.schedule["event:".len..], &std.ascii.whitespace);
        if (event_type.len == 0) return error.InvalidTriggerSpec;
        return .{ .spec = .{
            .event_type = event_type,
            .action = .run_agent,
            .tier = .t1,
        } };
    }

    return error.InvalidTriggerSpec;
}

fn parseTriggerSpecObject(root: std.json.ObjectMap) ?TriggerSpec {
    const trigger_obj = objectField(root, "trigger");
    const action_obj = objectField(root, "action");

    const event_type = (if (trigger_obj) |obj|
        stringField(obj, "event_type") orelse stringField(obj, "type")
    else if (stringValue(root.get("trigger"))) |value|
        value
    else
        null) orelse stringField(root, "event_type") orelse stringField(root, "type") orelse return null;

    const action_name = (if (action_obj) |obj|
        stringField(obj, "type") orelse stringField(obj, "kind")
    else if (stringValue(root.get("action"))) |value|
        value
    else
        null) orelse stringField(root, "executor") orelse stringField(root, "action_type") orelse return null;

    const action = ActionKind.fromString(action_name) orelse return null;
    const tier_value = stringField(root, "tier") orelse if (action_obj) |obj| stringField(obj, "tier") else null;
    const tier = if (tier_value) |value| Tier.fromString(value) orelse .t1 else .t1;

    return .{
        .event_type = event_type,
        .source = optionalStringField(trigger_obj, root, "source"),
        .subject_type = optionalStringField(trigger_obj, root, "subject_type"),
        .subject_id = optionalStringField(trigger_obj, root, "subject_id"),
        .tier = tier,
        .action = action,
        .target = optionalActionString(action_obj, root),
        .instructions = optionalStringField(action_obj, root, "instructions") orelse
            optionalStringField(action_obj, root, "prompt") orelse
            optionalStringField(action_obj, root, "message"),
    };
}

fn objectField(root: std.json.ObjectMap, key: []const u8) ?std.json.ObjectMap {
    return switch (root.get(key) orelse return null) {
        .object => |obj| obj,
        else => null,
    };
}

fn stringField(root: std.json.ObjectMap, key: []const u8) ?[]const u8 {
    return stringValue(root.get(key));
}

fn stringValue(value: ?std.json.Value) ?[]const u8 {
    return switch (value orelse return null) {
        .string => |text| if (text.len > 0) text else null,
        else => null,
    };
}

fn optionalStringField(primary: ?std.json.ObjectMap, fallback: std.json.ObjectMap, key: []const u8) ?[]const u8 {
    if (primary) |obj| {
        if (stringField(obj, key)) |value| return value;
    }
    return stringField(fallback, key);
}

fn optionalActionString(action_obj: ?std.json.ObjectMap, root: std.json.ObjectMap) ?[]const u8 {
    const keys = [_][]const u8{ "target", "target_ref", "instance", "workflow_id", "loop_id", "agent", "ticket_queue" };
    if (action_obj) |obj| {
        for (keys) |key| {
            if (stringField(obj, key)) |value| return value;
        }
    }
    for (keys) |key| {
        if (stringField(root, key)) |value| return value;
    }
    return null;
}

fn matchesEvent(spec: TriggerSpec, event: state_mod.Event) bool {
    if (!std.mem.eql(u8, spec.event_type, event.event_type)) return false;
    if (spec.source) |value| {
        if (!std.mem.eql(u8, value, event.source)) return false;
    }
    if (spec.subject_type) |value| {
        if (!std.mem.eql(u8, value, event.subject_type)) return false;
    }
    if (spec.subject_id) |value| {
        if (!std.mem.eql(u8, value, event.subject_id)) return false;
    }
    return true;
}

fn hasDispatchRecord(allocator: std.mem.Allocator, events: []const state_mod.Event, order_id: []const u8, trigger_event_id: u64) !bool {
    for (events) |event| {
        if (!std.mem.eql(u8, event.source, source)) continue;
        if (!std.mem.eql(u8, event.subject_type, "order")) continue;
        if (!std.mem.eql(u8, event.subject_id, order_id)) continue;
        if (!std.mem.startsWith(u8, event.event_type, "dispatcher.")) continue;

        var tree = std.json.parseFromSlice(std.json.Value, allocator, event.payload_json, .{
            .allocate = .alloc_always,
        }) catch continue;
        defer tree.deinit();
        const root = switch (tree.value) {
            .object => |obj| obj,
            else => continue,
        };
        const recorded_id = u64Field(root, "trigger_event_id") orelse continue;
        if (recorded_id == trigger_event_id) return true;
    }
    return false;
}

fn u64Field(root: std.json.ObjectMap, key: []const u8) ?u64 {
    return switch (root.get(key) orelse return null) {
        .integer => |value| if (value < 0) null else @intCast(value),
        else => null,
    };
}

fn ensureApproval(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    order: orders_mod.Order,
    event: state_mod.Event,
    spec: TriggerSpec,
    now_ms: i64,
) !state_mod.Approval {
    const target_ref = try dispatchKey(allocator, order.id, event.id);
    defer allocator.free(target_ref);

    for (state.approvalsList()) |approval| {
        if (std.mem.eql(u8, approval.target_ref, target_ref)) return approval;
    }

    const title = try std.fmt.allocPrint(allocator, "Approve dispatcher {s}: {s}", .{ spec.action.string(), order.title });
    defer allocator.free(title);
    const summary = try std.fmt.allocPrint(allocator, "Tier {s} approval for event {d} ({s}) in space {s}.", .{
        spec.tier.string(),
        event.id,
        event.event_type,
        event.space_id,
    });
    defer allocator.free(summary);

    const approval = try state.addApproval(.{
        .space_id = event.space_id,
        .kind = "question",
        .queue = "dispatcher",
        .target_ref = target_ref,
        .title = title,
        .summary = summary,
        .created_at_ms = now_ms,
    });
    try appendApprovalCreatedEvent(state, approval, now_ms);
    return approval;
}

fn appendApprovalCreatedEvent(state: *state_mod.State, approval: state_mod.Approval, now_ms: i64) !void {
    var id_buf: [20]u8 = undefined;
    const subject_id = std.fmt.bufPrint(&id_buf, "{d}", .{approval.id}) catch unreachable;
    _ = try state.addEvent(.{
        .space_id = approval.space_id,
        .event_type = "approval.created",
        .source = "nullhub",
        .subject_type = "approval",
        .subject_id = subject_id,
        .title = approval.title,
        .summary = "Approval created",
        .severity = "info",
        .payload_json = "{}",
        .created_at_ms = now_ms,
    });
}

const WorkRunAppendOptions = struct {
    kind: []const u8,
    status: []const u8,
    event_type: []const u8,
    severity: []const u8,
    title_prefix: []const u8,
    summary: []const u8,
    evidence_ref: []const u8 = "",
};

fn appendWorkRun(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    ctx: DispatchContext,
    options: WorkRunAppendOptions,
) !ExecutionOutcome {
    _ = try state.addWorkRun(.{
        .id = ctx.idempotency_key,
        .space_id = ctx.event.space_id,
        .kind = options.kind,
        .status = options.status,
        .order_id = ctx.order.id,
        .trigger_event_id = ctx.event.id,
        .target = ctx.spec.target orelse "",
        .instructions = ctx.spec.instructions orelse "",
        .summary = options.summary,
        .evidence_ref = options.evidence_ref,
        .created_at_ms = ctx.now_ms,
        .updated_at_ms = ctx.now_ms,
    });

    const payload = try std.json.Stringify.valueAlloc(allocator, .{
        .order_id = ctx.order.id,
        .trigger_event_id = ctx.event.id,
        .run_id = ctx.idempotency_key,
        .idempotency_key = ctx.idempotency_key,
        .tier = ctx.spec.tier.string(),
        .action = ctx.spec.action.string(),
        .kind = options.kind,
        .status = options.status,
        .target = ctx.spec.target orelse "",
        .instructions = ctx.spec.instructions orelse "",
    }, .{});
    defer allocator.free(payload);

    const title = try std.fmt.allocPrint(allocator, "{s}: {s}", .{ options.title_prefix, ctx.order.title });
    defer allocator.free(title);
    const summary = try std.fmt.allocPrint(allocator, "{s} Trigger event {d} ({s}).", .{
        options.summary,
        ctx.event.id,
        ctx.event.event_type,
    });
    defer allocator.free(summary);

    _ = try state.addEvent(.{
        .space_id = ctx.event.space_id,
        .event_type = options.event_type,
        .source = source,
        .subject_type = "work_run",
        .subject_id = ctx.idempotency_key,
        .title = title,
        .summary = summary,
        .severity = options.severity,
        .evidence_ref = options.evidence_ref,
        .payload_json = payload,
        .created_at_ms = ctx.now_ms,
    });
    return .{ .succeeded = !std.mem.eql(u8, options.status, "failed") };
}

fn stripComponentPrefix(value: []const u8, prefix: []const u8) []const u8 {
    return if (std.mem.startsWith(u8, value, prefix)) value[prefix.len..] else value;
}

fn firstOutputLine(stderr: []const u8, stdout: []const u8) []const u8 {
    const selected = if (std.mem.trim(u8, stderr, " \t\r\n").len > 0) stderr else stdout;
    const trimmed = std.mem.trim(u8, selected, " \t\r\n");
    if (trimmed.len == 0) return "command failed";
    const end = std.mem.indexOfAny(u8, trimmed, "\r\n") orelse trimmed.len;
    return trimmed[0..end];
}

fn appendDispatchRecord(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    order: orders_mod.Order,
    event: state_mod.Event,
    spec: TriggerSpec,
    approval_id: ?u64,
    event_type: []const u8,
    now_ms: i64,
) !void {
    const payload = try std.json.Stringify.valueAlloc(allocator, .{
        .order_id = order.id,
        .trigger_event_id = event.id,
        .tier = spec.tier.string(),
        .action = spec.action.string(),
        .target = spec.target orelse "",
        .approval_id = approval_id orelse 0,
    }, .{});
    defer allocator.free(payload);

    const title = try std.fmt.allocPrint(allocator, "Dispatcher {s}: {s}", .{ spec.action.string(), order.title });
    defer allocator.free(title);
    const summary = try std.fmt.allocPrint(allocator, "Matched event {d} ({s}) with trigger order {s}.", .{
        event.id,
        event.event_type,
        order.id,
    });
    defer allocator.free(summary);

    _ = try state.addEvent(.{
        .space_id = event.space_id,
        .event_type = event_type,
        .source = source,
        .subject_type = "order",
        .subject_id = order.id,
        .title = title,
        .summary = summary,
        .severity = "info",
        .payload_json = payload,
        .created_at_ms = now_ms,
    });
}

fn dispatchKey(allocator: std.mem.Allocator, order_id: []const u8, event_id: u64) ![]u8 {
    return std.fmt.allocPrint(allocator, "dispatcher:order:{s}:event:{d}", .{ order_id, event_id });
}

fn loadCursor(allocator: std.mem.Allocator, paths: paths_mod.Paths) !Cursor {
    const cursor_path = try paths.dispatcherCursor(allocator);
    defer allocator.free(cursor_path);

    const bytes = blk: {
        const file = std_compat.fs.openFileAbsolute(cursor_path, .{}) catch |err| switch (err) {
            error.FileNotFound => return .{},
            else => return err,
        };
        defer file.close();
        break :blk try file.readToEndAlloc(allocator, 16 * 1024);
    };
    defer allocator.free(bytes);

    const parsed = try std.json.parseFromSlice(Cursor, allocator, bytes, .{
        .ignore_unknown_fields = true,
    });
    defer parsed.deinit();
    return parsed.value;
}

fn saveCursor(allocator: std.mem.Allocator, paths: paths_mod.Paths, cursor: Cursor) !void {
    const dispatcher_dir = try paths.dispatcherDir(allocator);
    defer allocator.free(dispatcher_dir);
    try ensureAbsoluteDir(dispatcher_dir);

    const cursor_path = try paths.dispatcherCursor(allocator);
    defer allocator.free(cursor_path);
    const json = try std.json.Stringify.valueAlloc(allocator, cursor, .{ .whitespace = .indent_2 });
    defer allocator.free(json);
    try durable_file.writeTextFileAtomically(allocator, cursor_path, json);
}

fn ensureAbsoluteDir(path: []const u8) !void {
    std_compat.fs.makeDirAbsolute(path) catch |err| switch (err) {
        error.PathAlreadyExists => {},
        error.FileNotFound => {
            const parent = std.fs.path.dirname(path) orelse return err;
            try ensureAbsoluteDir(parent);
            try std_compat.fs.makeDirAbsolute(path);
        },
        else => return err,
    };
}

fn createTriggerOrder(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    space_id: []const u8,
    id: []const u8,
    event_type: []const u8,
    tier: []const u8,
    action: []const u8,
) !void {
    try createTriggerOrderWithTarget(allocator, paths, space_id, id, event_type, tier, action, "test-target", "");
}

fn createTriggerOrderWithTarget(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    space_id: []const u8,
    id: []const u8,
    event_type: []const u8,
    tier: []const u8,
    action: []const u8,
    target: []const u8,
    instructions: []const u8,
) !void {
    const content = try std.fmt.allocPrint(allocator,
        \\{{"trigger":{{"event_type":"{s}"}},"tier":"{s}","action":{{"type":"{s}","target":"{s}","instructions":"{s}"}}}}
    , .{ event_type, tier, action, target, instructions });
    defer allocator.free(content);

    const created = try orders_mod.create(allocator, paths, space_id, .{
        .id = id,
        .title = id,
        .kind = "trigger",
        .content = content,
        .created_at_ms = 100,
        .updated_at_ms = 100,
    });
    defer created.deinit(allocator);

    const active = try orders_mod.transition(allocator, paths, space_id, id, .activate, 101);
    defer active.deinit(allocator);
}

fn writeTestBinary(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    component: []const u8,
    version: []const u8,
    script: []const u8,
) !void {
    try paths.ensureDirs();
    const bin_path = try paths.binary(allocator, component, version);
    defer allocator.free(bin_path);

    const file = try std_compat.fs.createFileAbsolute(bin_path, .{ .truncate = true });
    defer file.close();
    try file.writeAll(script);
    if (comptime std_compat.fs.has_executable_bit) {
        try file.chmod(0o755);
    }
}

const Recorder = struct {
    create_ticket_count: usize = 0,
    start_loop_count: usize = 0,
    start_workflow_count: usize = 0,
    run_agent_count: usize = 0,

    fn executors(self: *Recorder) Executors {
        return .{
            .ptr = self,
            .create_ticket = recordCreateTicket,
            .start_loop = recordStartLoop,
            .start_workflow = recordStartWorkflow,
            .run_agent = recordRunAgent,
        };
    }

    fn from(ptr: ?*anyopaque) *Recorder {
        return @ptrCast(@alignCast(ptr.?));
    }

    fn recordCreateTicket(ptr: ?*anyopaque, _: std.mem.Allocator, _: *state_mod.State, _: DispatchContext) !ExecutionOutcome {
        from(ptr).create_ticket_count += 1;
        return .{ .succeeded = true };
    }

    fn recordStartLoop(ptr: ?*anyopaque, _: std.mem.Allocator, _: *state_mod.State, _: DispatchContext) !ExecutionOutcome {
        from(ptr).start_loop_count += 1;
        return .{ .succeeded = true };
    }

    fn recordStartWorkflow(ptr: ?*anyopaque, _: std.mem.Allocator, _: *state_mod.State, _: DispatchContext) !ExecutionOutcome {
        from(ptr).start_workflow_count += 1;
        return .{ .succeeded = true };
    }

    fn recordRunAgent(ptr: ?*anyopaque, _: std.mem.Allocator, _: *state_mod.State, _: DispatchContext) !ExecutionOutcome {
        from(ptr).run_agent_count += 1;
        return .{ .succeeded = true };
    }
};

test "dispatcher matches active trigger orders in event space" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();
    try fixture.paths.ensureDirs();

    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try createTriggerOrder(allocator, fixture.paths, "ops", "match", "build.finished", "T0", "create_ticket");
    try createTriggerOrder(allocator, fixture.paths, "ops", "wrong-event", "deploy.finished", "T0", "create_ticket");
    try createTriggerOrder(allocator, fixture.paths, "other", "other-space", "build.finished", "T0", "create_ticket");
    const inactive = try orders_mod.create(allocator, fixture.paths, "ops", .{
        .id = "inactive",
        .title = "inactive",
        .kind = "trigger",
        .content = "{\"event_type\":\"build.finished\",\"tier\":\"T0\",\"action\":\"create_ticket\"}",
        .created_at_ms = 100,
        .updated_at_ms = 100,
    });
    defer inactive.deinit(allocator);

    _ = try state.addEvent(.{
        .space_id = "ops",
        .event_type = "build.finished",
        .source = "test",
        .title = "Build finished",
        .created_at_ms = 200,
    });

    var recorder = Recorder{};
    const result = try runOnce(allocator, fixture.paths, &state, 300, .{ .executors = recorder.executors() });
    try std.testing.expectEqual(@as(usize, 1), result.matched_orders);
    try std.testing.expectEqual(@as(usize, 1), result.executed);
    try std.testing.expectEqual(@as(usize, 1), recorder.create_ticket_count);
}

test "dispatcher default T0 executor creates durable workflow run" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();
    try fixture.paths.ensureDirs();

    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try createTriggerOrder(allocator, fixture.paths, "ops", "workflow-on-event", "deploy.ready", "T0", "start_workflow");
    _ = try state.addEvent(.{
        .space_id = "ops",
        .event_type = "deploy.ready",
        .source = "test",
        .title = "Deploy ready",
        .created_at_ms = 200,
    });

    const result = try runOnce(allocator, fixture.paths, &state, 300, .{});
    try std.testing.expectEqual(@as(usize, 1), result.executed);
    try std.testing.expectEqual(@as(usize, 0), result.failed);
    try std.testing.expectEqual(@as(usize, 1), state.workRunsList().len);
    const run = state.workRunsList()[0];
    try std.testing.expectEqualStrings("workflow", run.kind);
    try std.testing.expectEqualStrings("running", run.status);
    try std.testing.expectEqualStrings("workflow-on-event", run.order_id);
    try std.testing.expectEqual(@as(u64, 1), run.trigger_event_id);

    var saw_workflow_started = false;
    var saw_legacy_synthetic = false;
    var saw_dispatch_record = false;
    for (state.eventsList()) |event| {
        if (std.mem.eql(u8, event.event_type, "work.workflow.started") and
            std.mem.eql(u8, event.source, source) and
            std.mem.eql(u8, event.subject_type, "work_run") and
            std.mem.eql(u8, event.subject_id, run.id))
        {
            saw_workflow_started = true;
        }
        if (std.mem.eql(u8, event.event_type, "workflow.started")) {
            saw_legacy_synthetic = true;
        }
        if (std.mem.eql(u8, event.event_type, "dispatcher.executed") and
            std.mem.eql(u8, event.source, source) and
            std.mem.eql(u8, event.subject_type, "order"))
        {
            saw_dispatch_record = true;
        }
    }
    try std.testing.expect(saw_workflow_started);
    try std.testing.expect(!saw_legacy_synthetic);
    try std.testing.expect(saw_dispatch_record);

    var loaded = try state_mod.State.load(allocator, state_path);
    defer loaded.deinit();
    try std.testing.expectEqual(@as(usize, 1), loaded.workRunsList().len);
    try std.testing.expectEqualStrings(run.id, loaded.workRunsList()[0].id);
}

test "dispatcher run_agent invokes managed nullclaw and records completed work run" {
    if (comptime builtin.os.tag == .windows) return error.SkipZigTest;

    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();
    try fixture.paths.ensureDirs();

    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();
    try state.addInstance("nullclaw", "agent-one", .{ .version = "1.0.0", .space_id = "ops" });

    const script =
        \\#!/bin/sh
        \\set -eu
        \\if [ "$1" = "agent" ] && [ "$2" = "invoke" ] && [ "$3" = "--message" ] && [ "$4" = "hello from dispatcher" ] && [ "$5" = "--session" ] && [ "$7" = "--json" ]; then
        \\  printf '%s\n' '{"response":"ok"}'
        \\  exit 0
        \\fi
        \\echo "unexpected args: $*" >&2
        \\exit 1
        \\
    ;
    try writeTestBinary(allocator, fixture.paths, "nullclaw", "1.0.0", script);

    try createTriggerOrderWithTarget(
        allocator,
        fixture.paths,
        "ops",
        "agent-on-event",
        "review.ready",
        "T0",
        "run_agent",
        "nullclaw/agent-one",
        "hello from dispatcher",
    );
    _ = try state.addEvent(.{
        .space_id = "ops",
        .event_type = "review.ready",
        .source = "test",
        .title = "Review ready",
        .created_at_ms = 200,
    });

    const result = try runOnce(allocator, fixture.paths, &state, 300, .{});
    try std.testing.expectEqual(@as(usize, 1), result.executed);
    try std.testing.expectEqual(@as(usize, 0), result.failed);
    try std.testing.expectEqual(@as(usize, 1), state.workRunsList().len);
    const run = state.workRunsList()[0];
    try std.testing.expectEqualStrings("agent", run.kind);
    try std.testing.expectEqualStrings("completed", run.status);
    try std.testing.expectEqualStrings("nullclaw/agent-one", run.target);
    try std.testing.expectEqualStrings("hello from dispatcher", run.instructions);

    var saw_agent_completed = false;
    var saw_dispatch_record = false;
    for (state.eventsList()) |event| {
        if (std.mem.eql(u8, event.event_type, "work.agent.completed") and
            std.mem.eql(u8, event.source, source) and
            std.mem.eql(u8, event.subject_type, "work_run") and
            std.mem.eql(u8, event.subject_id, run.id))
        {
            saw_agent_completed = true;
        }
        if (std.mem.eql(u8, event.event_type, "dispatcher.executed")) {
            saw_dispatch_record = true;
        }
    }
    try std.testing.expect(saw_agent_completed);
    try std.testing.expect(saw_dispatch_record);
}

test "dispatcher run_agent failure records failed work run instead of success" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();
    try fixture.paths.ensureDirs();

    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try createTriggerOrderWithTarget(
        allocator,
        fixture.paths,
        "ops",
        "missing-agent",
        "review.failed",
        "T0",
        "run_agent",
        "nullclaw/missing-agent",
        "hello",
    );
    _ = try state.addEvent(.{
        .space_id = "ops",
        .event_type = "review.failed",
        .source = "test",
        .title = "Review failed",
        .created_at_ms = 200,
    });

    const result = try runOnce(allocator, fixture.paths, &state, 300, .{});
    try std.testing.expectEqual(@as(usize, 0), result.executed);
    try std.testing.expectEqual(@as(usize, 1), result.failed);
    try std.testing.expectEqual(@as(usize, 1), state.workRunsList().len);
    const run = state.workRunsList()[0];
    try std.testing.expectEqualStrings("agent", run.kind);
    try std.testing.expectEqualStrings("failed", run.status);

    var saw_agent_failed = false;
    var saw_dispatch_failed = false;
    var saw_dispatch_executed = false;
    for (state.eventsList()) |event| {
        if (std.mem.eql(u8, event.event_type, "work.agent.failed") and
            std.mem.eql(u8, event.subject_type, "work_run") and
            std.mem.eql(u8, event.subject_id, run.id))
        {
            saw_agent_failed = true;
        }
        if (std.mem.eql(u8, event.event_type, "dispatcher.failed")) {
            saw_dispatch_failed = true;
        }
        if (std.mem.eql(u8, event.event_type, "dispatcher.executed")) {
            saw_dispatch_executed = true;
        }
    }
    try std.testing.expect(saw_agent_failed);
    try std.testing.expect(saw_dispatch_failed);
    try std.testing.expect(!saw_dispatch_executed);
}

test "dispatcher is idempotent when cursor is reset" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();
    try fixture.paths.ensureDirs();

    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try createTriggerOrder(allocator, fixture.paths, "ops", "ticket-on-event", "incident.opened", "T0", "create_ticket");
    _ = try state.addEvent(.{
        .space_id = "ops",
        .event_type = "incident.opened",
        .source = "test",
        .title = "Incident opened",
        .created_at_ms = 200,
    });

    var first_recorder = Recorder{};
    _ = try runOnce(allocator, fixture.paths, &state, 300, .{
        .executors = first_recorder.executors(),
        .save_cursor = false,
    });
    try std.testing.expectEqual(@as(usize, 1), first_recorder.create_ticket_count);

    var second_recorder = Recorder{};
    const second = try runOnce(allocator, fixture.paths, &state, 400, .{ .executors = second_recorder.executors() });
    try std.testing.expectEqual(@as(usize, 0), second_recorder.create_ticket_count);
    try std.testing.expectEqual(@as(usize, 1), second.skipped_idempotent);
}

test "dispatcher routes T0 to executor and T1 T2 to approvals" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();
    try fixture.paths.ensureDirs();

    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try createTriggerOrder(allocator, fixture.paths, "ops", "run-agent", "review.ready", "T0", "run_agent");
    try createTriggerOrder(allocator, fixture.paths, "ops", "start-loop", "review.ready", "T1", "start_loop");
    try createTriggerOrder(allocator, fixture.paths, "ops", "start-workflow", "review.ready", "T2", "start_workflow");
    _ = try state.addEvent(.{
        .space_id = "ops",
        .event_type = "review.ready",
        .source = "test",
        .title = "Review ready",
        .created_at_ms = 200,
    });

    var recorder = Recorder{};
    const result = try runOnce(allocator, fixture.paths, &state, 300, .{ .executors = recorder.executors() });
    try std.testing.expectEqual(@as(usize, 3), result.matched_orders);
    try std.testing.expectEqual(@as(usize, 1), result.executed);
    try std.testing.expectEqual(@as(usize, 2), result.approvals_created);
    try std.testing.expectEqual(@as(usize, 1), recorder.run_agent_count);
    try std.testing.expectEqual(@as(usize, 2), state.approvalsList().len);
}

test "dispatcher crash resume skips recorded execution and advances cursor" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();
    try fixture.paths.ensureDirs();

    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);

    {
        var state = state_mod.State.init(allocator, state_path);
        defer state.deinit();
        try createTriggerOrder(allocator, fixture.paths, "ops", "resume-ticket", "alert.raised", "T0", "create_ticket");
        _ = try state.addEvent(.{
            .space_id = "ops",
            .event_type = "alert.raised",
            .source = "test",
            .title = "Alert raised",
            .created_at_ms = 200,
        });

        var recorder = Recorder{};
        const first = try runOnce(allocator, fixture.paths, &state, 300, .{
            .executors = recorder.executors(),
            .save_cursor = false,
        });
        try std.testing.expectEqual(@as(usize, 1), first.executed);
        try std.testing.expectEqual(@as(usize, 1), recorder.create_ticket_count);
    }

    var resumed = try state_mod.State.load(allocator, state_path);
    defer resumed.deinit();
    var resumed_recorder = Recorder{};
    const second = try runOnce(allocator, fixture.paths, &resumed, 400, .{ .executors = resumed_recorder.executors() });
    try std.testing.expectEqual(@as(usize, 0), resumed_recorder.create_ticket_count);
    try std.testing.expectEqual(@as(usize, 1), second.skipped_idempotent);
    try std.testing.expect(second.cursor_after >= 2);

    const cursor = try loadCursor(allocator, fixture.paths);
    try std.testing.expect(cursor.last_event_id >= 2);
}
