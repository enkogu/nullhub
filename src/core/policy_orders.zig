const std = @import("std");
const std_compat = @import("compat");
const durable_file = @import("durable_file.zig");
const orders_mod = @import("orders.zig");
const paths_mod = @import("paths.zig");
const state_mod = @import("state.zig");
const test_helpers = @import("../test_helpers.zig");

pub const managed_orders_filename = "ORDERS.md";
pub const managed_orders_bootstrap_filename = "CONFIG.md";
pub const managed_orders_budget_bytes: usize = 24 * 1024;

const overflow_warning =
    "\n\n> Warning: active policy Orders exceeded the 24 KB ORDERS.md budget. " ++
    "NullHub truncated this managed file; review or split policy Orders to restore complete prompt coverage.\n";
const bootstrap_section_begin = "\n<!-- NULLHUB:MANAGED_POLICY_ORDERS:BEGIN -->\n";
const bootstrap_section_end = "<!-- NULLHUB:MANAGED_POLICY_ORDERS:END -->\n";

pub const RenderedManagedOrders = struct {
    bytes: []u8,
    active_count: usize,
    overflowed: bool,

    pub fn deinit(self: RenderedManagedOrders, allocator: std.mem.Allocator) void {
        allocator.free(self.bytes);
    }
};

pub const SyncResult = struct {
    workspaces_updated: usize = 0,
    active_count: usize = 0,
    overflowed: bool = false,
};

pub fn renderManagedOrders(
    allocator: std.mem.Allocator,
    space_id: []const u8,
    all_orders: []const orders_mod.Order,
) !RenderedManagedOrders {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();

    var overflowed = false;
    var active_count: usize = 0;

    try appendBudgeted(&buf, "# ORDERS.md\n\n", &overflowed);
    try appendBudgeted(&buf, "<!-- Managed by NullHub from active policy Orders. Do not edit directly. -->\n\n", &overflowed);
    try appendBudgeted(&buf, "Scope: space `", &overflowed);
    try appendInlineBudgeted(&buf, space_id, &overflowed);
    try appendBudgeted(&buf, "`\n\n", &overflowed);
    try appendBudgeted(&buf, "Only Orders with `kind: policy` and `status: active` are included.\n\n", &overflowed);

    for (all_orders) |order| {
        if (!isActivePolicyOrder(order)) continue;
        active_count += 1;
        try appendOrderSection(&buf, order, &overflowed);
    }

    if (active_count == 0) {
        try appendBudgeted(&buf, "No active policy Orders.\n", &overflowed);
    }

    return .{
        .bytes = try buf.toOwnedSlice(),
        .active_count = active_count,
        .overflowed = overflowed,
    };
}

pub fn syncManagedOrdersForSpace(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    space_id: []const u8,
) !SyncResult {
    const nullclaw_instances = state.instances.getPtr("nullclaw") orelse return .{};

    const loaded = try orders_mod.list(allocator, paths, space_id);
    defer {
        for (loaded) |order| order.deinit(allocator);
        allocator.free(loaded);
    }

    const rendered = try renderManagedOrders(allocator, space_id, loaded);
    defer rendered.deinit(allocator);

    var result = SyncResult{
        .active_count = rendered.active_count,
        .overflowed = rendered.overflowed,
    };

    var it = nullclaw_instances.iterator();
    while (it.next()) |entry| {
        const instance_name = entry.key_ptr.*;
        const instance = entry.value_ptr.*;
        if (!state.spaceMatches(instance.space_id, space_id)) continue;

        const workspace_dir = try paths.instanceWorkspaceDir(allocator, "nullclaw", instance_name);
        defer allocator.free(workspace_dir);
        try std_compat.fs.makePathAbsolute(workspace_dir);

        const orders_path = try std.fs.path.join(allocator, &.{ workspace_dir, managed_orders_filename });
        defer allocator.free(orders_path);
        try writeFileAtomically(allocator, orders_path, rendered.bytes);
        try syncBootstrapPromptFile(allocator, workspace_dir, rendered.bytes);
        result.workspaces_updated += 1;
    }

    return result;
}

fn isActivePolicyOrder(order: orders_mod.Order) bool {
    return std.mem.eql(u8, order.status, "active") and std.ascii.eqlIgnoreCase(order.kind, "policy");
}

fn appendOrderSection(
    buf: *std.array_list.Managed(u8),
    order: orders_mod.Order,
    overflowed: *bool,
) !void {
    try appendBudgeted(buf, "## ", overflowed);
    try appendInlineBudgeted(buf, order.title, overflowed);
    try appendBudgeted(buf, "\n\n", overflowed);

    try appendBudgeted(buf, "- Order ID: `", overflowed);
    try appendInlineBudgeted(buf, order.id, overflowed);
    try appendBudgeted(buf, "`\n", overflowed);

    if (order.summary.len > 0) {
        try appendBudgeted(buf, "- Summary: ", overflowed);
        try appendInlineBudgeted(buf, order.summary, overflowed);
        try appendBudgeted(buf, "\n", overflowed);
    }

    if (order.schedule.len > 0) {
        try appendBudgeted(buf, "- Schedule: `", overflowed);
        try appendInlineBudgeted(buf, order.schedule, overflowed);
        try appendBudgeted(buf, "`\n", overflowed);
    }

    try appendBudgeted(buf, "- Source: `", overflowed);
    try appendInlineBudgeted(buf, order.doc_path, overflowed);
    try appendBudgeted(buf, "`\n\n", overflowed);

    const trimmed = std.mem.trim(u8, order.content, " \t\r\n");
    if (trimmed.len > 0) {
        try appendBudgeted(buf, trimmed, overflowed);
        try appendBudgeted(buf, "\n\n", overflowed);
    }
}

fn appendInlineBudgeted(
    buf: *std.array_list.Managed(u8),
    text: []const u8,
    overflowed: *bool,
) !void {
    if (overflowed.*) return;
    for (text) |byte| {
        const rendered: []const u8 = switch (byte) {
            '\n', '\r', '\t' => " ",
            '`' => "'",
            else => &.{byte},
        };
        try appendBudgeted(buf, rendered, overflowed);
        if (overflowed.*) return;
    }
}

fn appendBudgeted(
    buf: *std.array_list.Managed(u8),
    text: []const u8,
    overflowed: *bool,
) !void {
    if (overflowed.*) return;
    if (buf.items.len + text.len <= managed_orders_budget_bytes) {
        try buf.appendSlice(text);
        return;
    }

    const content_limit = managed_orders_budget_bytes - overflow_warning.len;
    if (buf.items.len > content_limit) {
        const safe_len = utf8PrefixLen(buf.items, content_limit);
        buf.shrinkRetainingCapacity(safe_len);
    } else if (buf.items.len < content_limit) {
        const remaining = content_limit - buf.items.len;
        const safe_len = utf8PrefixLen(text, remaining);
        try buf.appendSlice(text[0..safe_len]);
    }

    try buf.appendSlice(overflow_warning);
    overflowed.* = true;
}

fn utf8PrefixLen(bytes: []const u8, limit: usize) usize {
    var end = @min(bytes.len, limit);
    while (end > 0) : (end -= 1) {
        if (std.unicode.utf8ValidateSlice(bytes[0..end])) return end;
    }
    return 0;
}

fn writeFileAtomically(allocator: std.mem.Allocator, path: []const u8, bytes: []const u8) !void {
    const dir_path = std.fs.path.dirname(path) orelse return error.InvalidPath;
    const base_name = std.fs.path.basename(path);
    const tmp_name = try std.fmt.allocPrint(allocator, ".{s}.{x}.tmp", .{
        base_name,
        std_compat.crypto.random.int(u64),
    });
    defer allocator.free(tmp_name);

    const tmp_path = try std.fs.path.join(allocator, &.{ dir_path, tmp_name });
    defer allocator.free(tmp_path);
    errdefer std_compat.fs.deleteFileAbsolute(tmp_path) catch {};

    {
        const file = try std_compat.fs.createFileAbsolute(tmp_path, .{ .truncate = true });
        defer file.close();
        try file.writeAll(bytes);
        try file.sync();
    }

    try std_compat.fs.renameAbsolute(tmp_path, path);
    try durable_file.syncDirectory(dir_path);
}

fn syncBootstrapPromptFile(allocator: std.mem.Allocator, workspace_dir: []const u8, orders_bytes: []const u8) !void {
    const config_path = try std.fs.path.join(allocator, &.{ workspace_dir, managed_orders_bootstrap_filename });
    defer allocator.free(config_path);

    const existing = std_compat.fs.readFileAbsolute(allocator, config_path, 1024 * 1024) catch |err| switch (err) {
        error.FileNotFound => try allocator.dupe(u8, "# CONFIG.md\n"),
        else => return err,
    };
    defer allocator.free(existing);

    const updated = try renderBootstrapPromptFile(allocator, existing, orders_bytes);
    defer allocator.free(updated);
    try writeFileAtomically(allocator, config_path, updated);
}

fn renderBootstrapPromptFile(allocator: std.mem.Allocator, existing: []const u8, orders_bytes: []const u8) ![]u8 {
    var base = std.array_list.Managed(u8).init(allocator);
    errdefer base.deinit();

    if (std.mem.indexOf(u8, existing, bootstrap_section_begin)) |begin_idx| {
        try base.appendSlice(std_compat.mem.trimRight(u8, existing[0..begin_idx], " \t\r\n"));
        if (std.mem.indexOfPos(u8, existing, begin_idx + bootstrap_section_begin.len, bootstrap_section_end)) |end_idx| {
            const tail_start = end_idx + bootstrap_section_end.len;
            const tail = std_compat.mem.trimLeft(u8, existing[tail_start..], " \t\r\n");
            if (tail.len > 0) {
                try base.appendSlice("\n\n");
                try base.appendSlice(tail);
            }
        }
    } else {
        try base.appendSlice(std_compat.mem.trimRight(u8, existing, " \t\r\n"));
    }

    if (base.items.len > 0) try base.appendSlice("\n\n");
    try base.appendSlice(bootstrap_section_begin);
    try base.appendSlice("# Managed Policy Orders\n\n");
    try base.appendSlice(
        "NullHub mirrors active policy Orders here because NullClaw fingerprints and injects CONFIG.md during prompt bootstrap. " ++
            "The source artifact is workspace/ORDERS.md.\n\n",
    );
    try base.appendSlice(orders_bytes);
    if (!std.mem.endsWith(u8, orders_bytes, "\n")) try base.appendSlice("\n");
    try base.appendSlice(bootstrap_section_end);

    return base.toOwnedSlice();
}

fn readWorkspaceOrders(allocator: std.mem.Allocator, paths: paths_mod.Paths, instance_name: []const u8) ![]u8 {
    const workspace_dir = try paths.instanceWorkspaceDir(allocator, "nullclaw", instance_name);
    defer allocator.free(workspace_dir);
    const orders_path = try std.fs.path.join(allocator, &.{ workspace_dir, managed_orders_filename });
    defer allocator.free(orders_path);
    return try std_compat.fs.readFileAbsolute(allocator, orders_path, managed_orders_budget_bytes + 1);
}

fn readWorkspaceBootstrapOrders(allocator: std.mem.Allocator, paths: paths_mod.Paths, instance_name: []const u8) ![]u8 {
    const workspace_dir = try paths.instanceWorkspaceDir(allocator, "nullclaw", instance_name);
    defer allocator.free(workspace_dir);
    const config_path = try std.fs.path.join(allocator, &.{ workspace_dir, managed_orders_bootstrap_filename });
    defer allocator.free(config_path);
    return try std_compat.fs.readFileAbsolute(allocator, config_path, managed_orders_budget_bytes + 4096);
}

fn ownedTestOrder(allocator: std.mem.Allocator, order: orders_mod.Order) !orders_mod.Order {
    return .{
        .id = try allocator.dupe(u8, order.id),
        .space_id = try allocator.dupe(u8, order.space_id),
        .title = try allocator.dupe(u8, order.title),
        .summary = try allocator.dupe(u8, order.summary),
        .kind = try allocator.dupe(u8, order.kind),
        .status = try allocator.dupe(u8, order.status),
        .schedule = try allocator.dupe(u8, order.schedule),
        .doc_path = try allocator.dupe(u8, order.doc_path),
        .content = try allocator.dupe(u8, order.content),
        .created_at_ms = order.created_at_ms,
        .updated_at_ms = order.updated_at_ms,
    };
}

test "managed ORDERS.md compilation includes only active policy orders" {
    const allocator = std.testing.allocator;
    const active_policy = try ownedTestOrder(allocator, .{
        .id = "policy-1",
        .space_id = "ops",
        .title = "Escalate blocked approvals",
        .summary = "Keep approval queues moving.",
        .kind = "policy",
        .status = "active",
        .schedule = "event:approval.created",
        .doc_path = "orders/policy-1.md",
        .content = "When an approval is older than one hour, notify the operator.",
        .created_at_ms = 1000,
        .updated_at_ms = 1100,
    });
    defer active_policy.deinit(allocator);
    const suspended_policy = try ownedTestOrder(allocator, .{
        .id = "policy-2",
        .space_id = "ops",
        .title = "Suspended policy",
        .kind = "policy",
        .status = "suspended",
        .doc_path = "orders/policy-2.md",
        .content = "This should not appear.",
        .created_at_ms = 1000,
        .updated_at_ms = 1100,
    });
    defer suspended_policy.deinit(allocator);
    const active_mandate = try ownedTestOrder(allocator, .{
        .id = "mandate-1",
        .space_id = "ops",
        .title = "Active non-policy order",
        .kind = "mandate",
        .status = "active",
        .doc_path = "orders/mandate-1.md",
        .content = "This should also not appear.",
        .created_at_ms = 1000,
        .updated_at_ms = 1100,
    });
    defer active_mandate.deinit(allocator);

    const all_orders = [_]orders_mod.Order{ active_policy, suspended_policy, active_mandate };
    const rendered = try renderManagedOrders(allocator, "ops", &all_orders);
    defer rendered.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 1), rendered.active_count);
    try std.testing.expect(!rendered.overflowed);
    try std.testing.expect(std.mem.indexOf(u8, rendered.bytes, "Escalate blocked approvals") != null);
    try std.testing.expect(std.mem.indexOf(u8, rendered.bytes, "approval is older than one hour") != null);
    try std.testing.expect(std.mem.indexOf(u8, rendered.bytes, "Suspended policy") == null);
    try std.testing.expect(std.mem.indexOf(u8, rendered.bytes, "Active non-policy order") == null);
}

test "managed ORDERS.md budget guard truncates with overflow warning" {
    const allocator = std.testing.allocator;
    const large_content = try allocator.alloc(u8, managed_orders_budget_bytes + 4096);
    defer allocator.free(large_content);
    @memset(large_content, 'A');
    @memcpy(large_content[large_content.len - "TAIL-SHOULD-NOT-APPEAR".len ..], "TAIL-SHOULD-NOT-APPEAR");

    const policy = try ownedTestOrder(allocator, .{
        .id = "policy-large",
        .space_id = "ops",
        .title = "Large policy",
        .kind = "policy",
        .status = "active",
        .doc_path = "orders/policy-large.md",
        .content = large_content,
        .created_at_ms = 1000,
        .updated_at_ms = 1100,
    });
    defer policy.deinit(allocator);

    const rendered = try renderManagedOrders(allocator, "ops", &.{policy});
    defer rendered.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 1), rendered.active_count);
    try std.testing.expect(rendered.overflowed);
    try std.testing.expect(rendered.bytes.len <= managed_orders_budget_bytes);
    try std.testing.expect(std.mem.indexOf(u8, rendered.bytes, "exceeded the 24 KB ORDERS.md budget") != null);
    try std.testing.expect(std.mem.indexOf(u8, rendered.bytes, "TAIL-SHOULD-NOT-APPEAR") == null);
    try std.testing.expect(std.unicode.utf8ValidateSlice(rendered.bytes));
}

test "managed ORDERS.md sync updates matching nullclaw workspaces" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try state.addInstance("nullclaw", "ops-agent", .{ .version = "dev-local", .space_id = "ops" });
    try state.addInstance("nullclaw", "sales-agent", .{ .version = "dev-local", .space_id = "sales" });

    const created = try orders_mod.create(allocator, fixture.paths, "ops", .{
        .id = "policy-1",
        .title = "Follow the ops escalation path",
        .kind = "policy",
        .content = "Escalate critical operations alerts immediately.",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer created.deinit(allocator);
    const active = try orders_mod.transition(allocator, fixture.paths, "ops", created.id, .activate, 1100);
    defer active.deinit(allocator);

    const synced = try syncManagedOrdersForSpace(allocator, fixture.paths, &state, "ops");
    try std.testing.expectEqual(@as(usize, 1), synced.workspaces_updated);
    try std.testing.expectEqual(@as(usize, 1), synced.active_count);

    const ops_orders = try readWorkspaceOrders(allocator, fixture.paths, "ops-agent");
    defer allocator.free(ops_orders);
    try std.testing.expect(std.mem.indexOf(u8, ops_orders, "Follow the ops escalation path") != null);

    const ops_bootstrap = try readWorkspaceBootstrapOrders(allocator, fixture.paths, "ops-agent");
    defer allocator.free(ops_bootstrap);
    try std.testing.expect(std.mem.indexOf(u8, ops_bootstrap, "NULLHUB:MANAGED_POLICY_ORDERS:BEGIN") != null);
    try std.testing.expect(std.mem.indexOf(u8, ops_bootstrap, "NullClaw fingerprints and injects CONFIG.md") != null);
    try std.testing.expect(std.mem.indexOf(u8, ops_bootstrap, "Escalate critical operations alerts immediately.") != null);

    const sales_workspace = try fixture.paths.instanceWorkspaceDir(allocator, "nullclaw", "sales-agent");
    defer allocator.free(sales_workspace);
    const sales_orders_path = try std.fs.path.join(allocator, &.{ sales_workspace, managed_orders_filename });
    defer allocator.free(sales_orders_path);
    try std.testing.expectError(error.FileNotFound, std_compat.fs.readFileAbsolute(allocator, sales_orders_path, 1024));
}

test "managed ORDERS.md bootstrap section is replaced without deleting local CONFIG.md content" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try state.addInstance("nullclaw", "ops-agent", .{ .version = "dev-local", .space_id = "ops" });
    const workspace_dir = try fixture.paths.instanceWorkspaceDir(allocator, "nullclaw", "ops-agent");
    defer allocator.free(workspace_dir);
    try std_compat.fs.makePathAbsolute(workspace_dir);
    const config_path = try std.fs.path.join(allocator, &.{ workspace_dir, managed_orders_bootstrap_filename });
    defer allocator.free(config_path);
    try writeFileAtomically(allocator, config_path, "# CONFIG.md\n\nKeep this local note.\n\n" ++
        bootstrap_section_begin ++
        "stale policy text\n" ++
        bootstrap_section_end ++
        "\nTrailing local note.\n");

    var order = try orders_mod.create(allocator, fixture.paths, "ops", .{
        .id = "policy-review",
        .title = "Require review",
        .kind = "policy",
        .content = "Every production change needs approval.",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer order.deinit(allocator);
    var active = try orders_mod.transition(allocator, fixture.paths, "ops", "policy-review", .activate, 1100);
    defer active.deinit(allocator);

    _ = try syncManagedOrdersForSpace(allocator, fixture.paths, &state, "ops");

    const updated = try std_compat.fs.readFileAbsolute(allocator, config_path, managed_orders_budget_bytes + 4096);
    defer allocator.free(updated);
    try std.testing.expect(std.mem.indexOf(u8, updated, "Keep this local note.") != null);
    try std.testing.expect(std.mem.indexOf(u8, updated, "Trailing local note.") != null);
    try std.testing.expect(std.mem.indexOf(u8, updated, "stale policy text") == null);
    try std.testing.expect(std.mem.indexOf(u8, updated, "Every production change needs approval.") != null);
}
