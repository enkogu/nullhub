const std = @import("std");
const orders_mod = @import("orders.zig");
const state_mod = @import("state.zig");

pub const required_safe_executions: usize = 2;
pub const failure_threshold: usize = 3;

pub const Summary = struct {
    status: []const u8,
    guarded: bool,
    probation: bool,
    circuit_open: bool,
    safe_executions: usize,
    required_safe_executions: usize = required_safe_executions,
    consecutive_failures: usize,
    failure_threshold: usize = failure_threshold,
    reset_event_id: u64 = 0,
    last_success_event_id: u64 = 0,
    last_failure_event_id: u64 = 0,
    circuit_opened_event_id: u64 = 0,
    updated_at_ms: i64 = 0,
};

pub fn evaluate(order: orders_mod.Order, events: []const state_mod.Event) Summary {
    const guarded = isGuardedOrder(order);
    if (!guarded) {
        return .{
            .status = "not_applicable",
            .guarded = false,
            .probation = false,
            .circuit_open = false,
            .safe_executions = 0,
            .consecutive_failures = 0,
        };
    }

    const reset_event_id = latestResetEventId(order, events);
    var safe_executions: usize = 0;
    var consecutive_failures: usize = 0;
    var last_success_event_id: u64 = 0;
    var last_failure_event_id: u64 = 0;
    var circuit_opened_event_id: u64 = 0;
    var updated_at_ms: i64 = 0;

    for (events) |event| {
        if (event.id <= reset_event_id) continue;
        if (isSuccessEvent(order, event)) {
            safe_executions += 1;
            consecutive_failures = 0;
            last_success_event_id = event.id;
            updated_at_ms = @max(updated_at_ms, event.created_at_ms);
            continue;
        }
        if (isFailureEvent(order, event)) {
            consecutive_failures += 1;
            last_failure_event_id = event.id;
            updated_at_ms = @max(updated_at_ms, event.created_at_ms);
            continue;
        }
        if (isCircuitOpenedEvent(order, event)) {
            circuit_opened_event_id = event.id;
            updated_at_ms = @max(updated_at_ms, event.created_at_ms);
            continue;
        }
    }

    const active = std.mem.eql(u8, order.status, "active");
    const circuit_open = active and circuit_opened_event_id > reset_event_id;
    const probation = active and !circuit_open and safe_executions < required_safe_executions;
    const status = if (!active)
        "inactive"
    else if (circuit_open)
        "circuit_open"
    else if (probation)
        "probation"
    else
        "clear";

    return .{
        .status = status,
        .guarded = true,
        .probation = probation,
        .circuit_open = circuit_open,
        .safe_executions = safe_executions,
        .consecutive_failures = consecutive_failures,
        .reset_event_id = reset_event_id,
        .last_success_event_id = last_success_event_id,
        .last_failure_event_id = last_failure_event_id,
        .circuit_opened_event_id = circuit_opened_event_id,
        .updated_at_ms = updated_at_ms,
    };
}

pub fn isGuardedOrder(order: orders_mod.Order) bool {
    return std.ascii.eqlIgnoreCase(order.kind, "trigger") or
        std.ascii.eqlIgnoreCase(order.kind, "mandate") or
        std.ascii.eqlIgnoreCase(order.kind, "schedule");
}

fn latestResetEventId(order: orders_mod.Order, events: []const state_mod.Event) u64 {
    var latest: u64 = 0;
    for (events) |event| {
        if (!isOrderSubject(order, event)) continue;
        if (!std.mem.eql(u8, event.source, "nullhub")) continue;
        if (std.mem.eql(u8, event.event_type, "order.created") or
            std.mem.eql(u8, event.event_type, "order.updated") or
            std.mem.eql(u8, event.event_type, "order.scheduled") or
            std.mem.eql(u8, event.event_type, "order.activated") or
            std.mem.eql(u8, event.event_type, "order.resumed"))
        {
            latest = @max(latest, event.id);
        }
    }
    return latest;
}

fn isOrderSubject(order: orders_mod.Order, event: state_mod.Event) bool {
    return std.mem.eql(u8, event.subject_type, "order") and
        std.mem.eql(u8, event.subject_id, order.id) and
        std.mem.eql(u8, event.space_id, order.space_id);
}

fn isSuccessEvent(order: orders_mod.Order, event: state_mod.Event) bool {
    if (!isOrderSubject(order, event)) return false;
    if (std.mem.eql(u8, event.source, "nullhub.dispatcher") and
        std.mem.eql(u8, event.event_type, "dispatcher.executed"))
    {
        return true;
    }
    if (std.mem.eql(u8, event.source, "cron") and
        std.mem.eql(u8, event.event_type, "order.executed"))
    {
        return true;
    }
    return false;
}

fn isFailureEvent(order: orders_mod.Order, event: state_mod.Event) bool {
    return isOrderSubject(order, event) and
        std.mem.eql(u8, event.source, "nullhub.dispatcher") and
        std.mem.eql(u8, event.event_type, "dispatcher.failed");
}

fn isCircuitOpenedEvent(order: orders_mod.Order, event: state_mod.Event) bool {
    return isOrderSubject(order, event) and
        std.mem.eql(u8, event.source, "nullhub.dispatcher") and
        std.mem.eql(u8, event.event_type, "dispatcher.circuit_opened");
}

test "order safety derives probation clear and circuit state from events" {
    var events = [_]state_mod.Event{
        .{
            .id = 1,
            .space_id = "ops",
            .event_type = "order.activated",
            .source = "nullhub",
            .subject_type = "order",
            .subject_id = "order-1",
            .title = "Order activated",
            .created_at_ms = 1000,
        },
        .{
            .id = 2,
            .space_id = "ops",
            .event_type = "dispatcher.executed",
            .source = "nullhub.dispatcher",
            .subject_type = "order",
            .subject_id = "order-1",
            .title = "Dispatcher executed",
            .created_at_ms = 1100,
        },
        .{
            .id = 3,
            .space_id = "ops",
            .event_type = "dispatcher.executed",
            .source = "nullhub.dispatcher",
            .subject_type = "order",
            .subject_id = "order-1",
            .title = "Dispatcher executed",
            .created_at_ms = 1200,
        },
        .{
            .id = 4,
            .space_id = "ops",
            .event_type = "dispatcher.failed",
            .source = "nullhub.dispatcher",
            .subject_type = "order",
            .subject_id = "order-1",
            .title = "Dispatcher failed",
            .created_at_ms = 1300,
        },
        .{
            .id = 5,
            .space_id = "ops",
            .event_type = "dispatcher.circuit_opened",
            .source = "nullhub.dispatcher",
            .subject_type = "order",
            .subject_id = "order-1",
            .title = "Circuit opened",
            .created_at_ms = 1301,
        },
    };
    const order = orders_mod.Order{
        .id = "order-1",
        .space_id = "ops",
        .title = "Order",
        .kind = "trigger",
        .status = "active",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    };

    const one_success = evaluate(order, events[0..2]);
    try std.testing.expectEqualStrings("probation", one_success.status);
    try std.testing.expect(one_success.probation);
    try std.testing.expectEqual(@as(usize, 1), one_success.safe_executions);

    const clear = evaluate(order, events[0..3]);
    try std.testing.expectEqualStrings("clear", clear.status);
    try std.testing.expect(!clear.probation);
    try std.testing.expectEqual(@as(usize, 2), clear.safe_executions);

    const open = evaluate(order, events[0..]);
    try std.testing.expectEqualStrings("circuit_open", open.status);
    try std.testing.expect(open.circuit_open);
    try std.testing.expectEqual(@as(u64, 5), open.circuit_opened_event_id);
}
