const std = @import("std");
const state_mod = @import("../core/state.zig");

const EventSpec = struct {
    event_type: []const u8,
    source: []const u8,
    subject_type: []const u8,
    subject_id: []const u8,
    title: []const u8,
    summary: []const u8,
    severity: []const u8 = "info",
};

pub fn emitNullTicketsTransition(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    instance_name: []const u8,
    method: std.http.Method,
    path: []const u8,
    status: []const u8,
    now_ms: i64,
) !void {
    if (!isSuccessStatus(status)) return;
    const spec = nullTicketsEvent(method, path) orelse return;
    try appendInstanceEvent(allocator, state, "nulltickets", instance_name, spec, now_ms, path, status);
}

pub fn emitNullBoilerTransition(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    instance_name: ?[]const u8,
    method: []const u8,
    target: []const u8,
    status: []const u8,
    now_ms: i64,
) !void {
    if (!isSuccessStatus(status)) return;
    const spec = nullBoilerEvent(method, target) orelse return;
    try appendInstanceEvent(allocator, state, "nullboiler", instance_name orelse "", spec, now_ms, target, status);
}

pub fn emitCronScheduled(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    component: []const u8,
    instance_name: []const u8,
    job_id: []const u8,
    once: bool,
    now_ms: i64,
) !void {
    try appendInstanceEvent(allocator, state, component, instance_name, .{
        .event_type = if (once) "work.cron.once_scheduled" else "work.cron.scheduled",
        .source = "cron",
        .subject_type = "cron_job",
        .subject_id = job_id,
        .title = if (once) "One-shot cron job scheduled" else "Cron job scheduled",
        .summary = "A managed cron job was scheduled.",
    }, now_ms, job_id, "200 OK");
}

pub fn emitCronJobAction(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    component: []const u8,
    instance_name: []const u8,
    job_id: []const u8,
    action: []const u8,
    now_ms: i64,
) !void {
    const spec = cronActionEvent(job_id, action) orelse return;
    try appendInstanceEvent(allocator, state, component, instance_name, spec, now_ms, job_id, "200 OK");
}

pub fn isSuccessStatus(status: []const u8) bool {
    return status.len >= 3 and status[0] == '2' and std.ascii.isDigit(status[1]) and std.ascii.isDigit(status[2]);
}

fn appendInstanceEvent(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    component: []const u8,
    instance_name: []const u8,
    spec: EventSpec,
    now_ms: i64,
    action_ref: []const u8,
    status: []const u8,
) !void {
    const space_id = instanceSpace(state, component, instance_name);
    const payload_json = try std.json.Stringify.valueAlloc(allocator, .{
        .component = component,
        .instance = instance_name,
        .action_ref = action_ref,
        .status = status,
    }, .{});
    defer allocator.free(payload_json);

    _ = try state.addEvent(.{
        .space_id = space_id,
        .event_type = spec.event_type,
        .source = spec.source,
        .subject_type = spec.subject_type,
        .subject_id = spec.subject_id,
        .title = spec.title,
        .summary = spec.summary,
        .severity = spec.severity,
        .payload_json = payload_json,
        .created_at_ms = now_ms,
    });
    try state.save();
}

fn instanceSpace(state: *state_mod.State, component: []const u8, instance_name: []const u8) []const u8 {
    if (instance_name.len > 0) {
        if (state.getInstance(component, instance_name)) |entry| {
            if (entry.space_id.len > 0) return entry.space_id;
        }
    }
    return "default";
}

fn nullTicketsEvent(method: std.http.Method, path: []const u8) ?EventSpec {
    if (method != .POST) return null;
    const clean = stripQuery(path);
    if (singleSegmentWithSuffix(clean, "/runs/", "/transition")) |run_id| {
        return .{
            .event_type = "work.ticket.transitioned",
            .source = "nulltickets",
            .subject_type = "ticket_run",
            .subject_id = run_id,
            .title = "Ticket run transitioned",
            .summary = "A NullTickets run transition completed.",
            .severity = "success",
        };
    }
    if (singleSegmentWithSuffix(clean, "/runs/", "/fail")) |run_id| {
        return .{
            .event_type = "work.ticket.failed",
            .source = "nulltickets",
            .subject_type = "ticket_run",
            .subject_id = run_id,
            .title = "Ticket run failed",
            .summary = "A NullTickets run failure transition completed.",
            .severity = "error",
        };
    }
    return null;
}

fn nullBoilerEvent(method: []const u8, target: []const u8) ?EventSpec {
    if (!std.mem.eql(u8, method, "POST") and !std.mem.eql(u8, method, "PATCH")) return null;
    const clean = stripQuery(target);
    if (singleSegmentWithSuffix(clean, "/api/nullboiler/workflows/", "/run")) |workflow_id| {
        return .{
            .event_type = "work.workflow.started",
            .source = "nullboiler",
            .subject_type = "workflow",
            .subject_id = workflow_id,
            .title = "Workflow run started",
            .summary = "A NullBoiler workflow run was started.",
            .severity = "success",
        };
    }
    if (singleSegmentWithSuffix(clean, "/api/nullboiler/runs/", "/transition")) |run_id| {
        return .{
            .event_type = "work.workflow.transitioned",
            .source = "nullboiler",
            .subject_type = "workflow_run",
            .subject_id = run_id,
            .title = "Workflow run transitioned",
            .summary = "A NullBoiler workflow run transition completed.",
            .severity = "success",
        };
    }
    if (singleSegmentWithSuffix(clean, "/api/nullboiler/runs/", "/fail")) |run_id| {
        return .{
            .event_type = "work.workflow.failed",
            .source = "nullboiler",
            .subject_type = "workflow_run",
            .subject_id = run_id,
            .title = "Workflow run failed",
            .summary = "A NullBoiler workflow run failure transition completed.",
            .severity = "error",
        };
    }
    return null;
}

fn cronActionEvent(job_id: []const u8, action: []const u8) ?EventSpec {
    if (std.mem.eql(u8, action, "ran")) {
        return .{
            .event_type = "work.cron.executed",
            .source = "cron",
            .subject_type = "cron_job",
            .subject_id = job_id,
            .title = "Cron job executed",
            .summary = "A managed cron job was executed.",
            .severity = "success",
        };
    }
    if (std.mem.eql(u8, action, "paused")) {
        return .{
            .event_type = "work.cron.paused",
            .source = "cron",
            .subject_type = "cron_job",
            .subject_id = job_id,
            .title = "Cron job paused",
            .summary = "A managed cron job was paused.",
        };
    }
    if (std.mem.eql(u8, action, "resumed")) {
        return .{
            .event_type = "work.cron.resumed",
            .source = "cron",
            .subject_type = "cron_job",
            .subject_id = job_id,
            .title = "Cron job resumed",
            .summary = "A managed cron job was resumed.",
        };
    }
    if (std.mem.eql(u8, action, "updated")) {
        return .{
            .event_type = "work.cron.updated",
            .source = "cron",
            .subject_type = "cron_job",
            .subject_id = job_id,
            .title = "Cron job updated",
            .summary = "A managed cron job was updated.",
        };
    }
    if (std.mem.eql(u8, action, "deleted")) {
        return .{
            .event_type = "work.cron.deleted",
            .source = "cron",
            .subject_type = "cron_job",
            .subject_id = job_id,
            .title = "Cron job deleted",
            .summary = "A managed cron job was deleted.",
        };
    }
    return null;
}

fn stripQuery(path: []const u8) []const u8 {
    return path[0..(std.mem.indexOfScalar(u8, path, '?') orelse path.len)];
}

fn singleSegmentWithSuffix(path: []const u8, prefix: []const u8, suffix: []const u8) ?[]const u8 {
    if (!std.mem.startsWith(u8, path, prefix)) return null;
    if (!std.mem.endsWith(u8, path, suffix)) return null;
    const segment = path[prefix.len .. path.len - suffix.len];
    if (segment.len == 0 or std.mem.indexOfScalar(u8, segment, '/') != null) return null;
    return segment;
}

test "event producer classifiers select ticket workflow and cron event types" {
    const ticket = nullTicketsEvent(.POST, "/runs/run-1/transition").?;
    try std.testing.expectEqualStrings("work.ticket.transitioned", ticket.event_type);
    try std.testing.expectEqualStrings("run-1", ticket.subject_id);

    const workflow = nullBoilerEvent("POST", "/api/nullboiler/workflows/wf-1/run?boiler_instance=boiler-a").?;
    try std.testing.expectEqualStrings("work.workflow.started", workflow.event_type);
    try std.testing.expectEqualStrings("wf-1", workflow.subject_id);

    const cron = cronActionEvent("job-1", "ran").?;
    try std.testing.expectEqualStrings("work.cron.executed", cron.event_type);
    try std.testing.expectEqualStrings("cron_job", cron.subject_type);
}

test "event producer ignores unsuccessful statuses" {
    try std.testing.expect(isSuccessStatus("200 OK"));
    try std.testing.expect(isSuccessStatus("204 No Content"));
    try std.testing.expect(!isSuccessStatus("409 Conflict"));
}
