const std = @import("std");
const builtin = @import("builtin");
const std_compat = @import("compat");
const component_cli = @import("component_cli.zig");
const durable_file = @import("durable_file.zig");
const orders_mod = @import("orders.zig");
const paths_mod = @import("paths.zig");
const state_mod = @import("state.zig");
const test_helpers = @import("../test_helpers.zig");

pub const managed_orders_filename = "ORDERS.md";
pub const managed_orders_bootstrap_filename = "CONFIG.md";
pub const managed_orders_bootstrap_memory_key = "__bootstrap.prompt.CONFIG.md";
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
    bootstrap_file_updates: usize = 0,
    bootstrap_provider_updates: usize = 0,
    unsupported_bootstrap_count: usize = 0,
    active_count: usize = 0,
    overflowed: bool = false,
};

const BootstrapStorage = enum {
    workspace_files,
    provider_backed,
    unsupported_noop,
};

const nullclaw_default_memory_backend = "hybrid";
const nullclaw_provider_sync_timeout_ms = 30_000;
const nullclaw_provider_sync_output_limit = 256 * 1024;

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

        const disk_bootstrap = try syncBootstrapPromptFile(allocator, workspace_dir, rendered.bytes);
        defer allocator.free(disk_bootstrap);

        const bootstrap = try resolveInstanceBootstrapStorage(allocator, paths, instance_name);
        defer allocator.free(bootstrap.backend);

        switch (bootstrap.storage) {
            .workspace_files => result.bootstrap_file_updates += 1,
            .provider_backed => {
                try syncProviderBootstrapPromptFile(
                    allocator,
                    paths,
                    instance_name,
                    instance.version,
                    disk_bootstrap,
                    rendered.bytes,
                );
                result.bootstrap_provider_updates += 1;
            },
            .unsupported_noop => result.unsupported_bootstrap_count += 1,
        }

        result.workspaces_updated += 1;
    }

    return result;
}

pub fn appendUnsupportedBootstrapEvent(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    space_id: []const u8,
    subject_type: []const u8,
    subject_id: []const u8,
    title: []const u8,
    now_ms: i64,
    unsupported_count: usize,
) !void {
    const payload = try std.fmt.allocPrint(
        allocator,
        "{{\"file\":\"{s}\",\"bootstrap_key\":\"{s}\",\"unsupported_count\":{d}}}",
        .{ managed_orders_bootstrap_filename, managed_orders_bootstrap_memory_key, unsupported_count },
    );
    defer allocator.free(payload);

    _ = try state.addEvent(.{
        .space_id = space_id,
        .event_type = "order.policy_orders_bootstrap_unsupported",
        .source = "nullhub",
        .subject_type = subject_type,
        .subject_id = subject_id,
        .title = title,
        .summary = "Managed policy Orders were written to ORDERS.md and CONFIG.md, but this NullClaw backend cannot expose updates through a reloadable bootstrap fingerprint.",
        .severity = "warning",
        .payload_json = payload,
        .created_at_ms = now_ms,
    });
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

fn syncBootstrapPromptFile(allocator: std.mem.Allocator, workspace_dir: []const u8, orders_bytes: []const u8) ![]u8 {
    const config_path = try std.fs.path.join(allocator, &.{ workspace_dir, managed_orders_bootstrap_filename });
    defer allocator.free(config_path);

    const existing = std_compat.fs.readFileAbsolute(allocator, config_path, 1024 * 1024) catch |err| switch (err) {
        error.FileNotFound => try allocator.dupe(u8, "# CONFIG.md\n"),
        else => return err,
    };
    defer allocator.free(existing);

    const updated = try renderBootstrapPromptFile(allocator, existing, orders_bytes);
    try writeFileAtomically(allocator, config_path, updated);
    return updated;
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

const InstanceBootstrapStorage = struct {
    backend: []u8,
    storage: BootstrapStorage,
};

fn resolveInstanceBootstrapStorage(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    instance_name: []const u8,
) !InstanceBootstrapStorage {
    const backend = try readInstanceMemoryBackend(allocator, paths, instance_name);
    errdefer allocator.free(backend);
    return .{
        .backend = backend,
        .storage = classifyBootstrapStorage(backend),
    };
}

fn readInstanceMemoryBackend(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    instance_name: []const u8,
) ![]u8 {
    const config_path = try paths.instanceConfig(allocator, "nullclaw", instance_name);
    defer allocator.free(config_path);

    const bytes = std_compat.fs.readFileAbsolute(allocator, config_path, 4 * 1024 * 1024) catch |err| switch (err) {
        error.FileNotFound => return allocator.dupe(u8, nullclaw_default_memory_backend),
        else => return err,
    };
    defer allocator.free(bytes);

    var parsed = std.json.parseFromSlice(std.json.Value, allocator, bytes, .{
        .allocate = .alloc_always,
        .ignore_unknown_fields = true,
    }) catch return allocator.dupe(u8, nullclaw_default_memory_backend);
    defer parsed.deinit();

    if (parsed.value != .object) return allocator.dupe(u8, nullclaw_default_memory_backend);
    const root = parsed.value.object;

    if (root.get("memory")) |memory_value| {
        if (memory_value == .object) {
            if (stringField(memory_value.object, "backend")) |backend| return allocator.dupe(u8, backend);
            if (stringField(memory_value.object, "profile")) |profile| return allocator.dupe(u8, backendForMemoryProfile(profile));
        }
    }
    if (stringField(root, "memory_backend")) |backend| return allocator.dupe(u8, backend);
    if (stringField(root, "memory_profile")) |profile| return allocator.dupe(u8, backendForMemoryProfile(profile));

    return allocator.dupe(u8, nullclaw_default_memory_backend);
}

fn stringField(obj: std.json.ObjectMap, key: []const u8) ?[]const u8 {
    const value = obj.get(key) orelse return null;
    if (value != .string) return null;
    const trimmed = std.mem.trim(u8, value.string, &std.ascii.whitespace);
    return if (trimmed.len == 0) null else trimmed;
}

fn stringFieldRaw(obj: std.json.ObjectMap, key: []const u8) ?[]const u8 {
    const value = obj.get(key) orelse return null;
    if (value != .string) return null;
    return value.string;
}

fn backendForMemoryProfile(profile: []const u8) []const u8 {
    if (std.ascii.eqlIgnoreCase(profile, "minimal_none")) return "none";
    if (std.ascii.eqlIgnoreCase(profile, "markdown_only")) return "markdown";
    if (std.ascii.eqlIgnoreCase(profile, "local_keyword") or
        std.ascii.eqlIgnoreCase(profile, "local_hybrid"))
    {
        return "sqlite";
    }
    if (std.ascii.eqlIgnoreCase(profile, "postgres_keyword") or
        std.ascii.eqlIgnoreCase(profile, "postgres_hybrid"))
    {
        return "postgres";
    }
    return nullclaw_default_memory_backend;
}

fn classifyBootstrapStorage(backend: []const u8) BootstrapStorage {
    if (std.ascii.eqlIgnoreCase(backend, "hybrid") or
        std.ascii.eqlIgnoreCase(backend, "markdown"))
    {
        return .workspace_files;
    }
    if (std.ascii.eqlIgnoreCase(backend, "none") or
        std.ascii.eqlIgnoreCase(backend, "memory"))
    {
        return .unsupported_noop;
    }
    return .provider_backed;
}

fn syncProviderBootstrapPromptFile(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    instance_name: []const u8,
    version: []const u8,
    disk_bootstrap: []const u8,
    orders_bytes: []const u8,
) !void {
    const provider_existing = try loadProviderBootstrapPromptFile(allocator, paths, instance_name, version);
    defer if (provider_existing) |bytes| allocator.free(bytes);

    const base = provider_existing orelse disk_bootstrap;
    const updated = try renderBootstrapPromptFile(allocator, base, orders_bytes);
    defer allocator.free(updated);

    try storeProviderBootstrapPromptFile(allocator, paths, instance_name, version, updated);
}

fn loadProviderBootstrapPromptFile(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    instance_name: []const u8,
    version: []const u8,
) !?[]u8 {
    const result = try runNullclawMemoryCommand(
        allocator,
        paths,
        instance_name,
        version,
        &.{ "memory", "get", managed_orders_bootstrap_memory_key, "--json" },
    );
    defer allocator.free(result.stderr);
    defer allocator.free(result.stdout);
    if (!result.success) return error.BootstrapProviderReadFailed;

    const trimmed = std.mem.trim(u8, result.stdout, " \t\r\n");
    if (std.mem.eql(u8, trimmed, "null")) return null;

    var parsed = std.json.parseFromSlice(std.json.Value, allocator, trimmed, .{
        .allocate = .alloc_always,
        .ignore_unknown_fields = true,
    }) catch return error.BootstrapProviderReadFailed;
    defer parsed.deinit();
    if (parsed.value != .object) return error.BootstrapProviderReadFailed;
    const content = stringFieldRaw(parsed.value.object, "content") orelse return error.BootstrapProviderReadFailed;
    return @as(?[]u8, try allocator.dupe(u8, content));
}

fn storeProviderBootstrapPromptFile(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    instance_name: []const u8,
    version: []const u8,
    bytes: []const u8,
) !void {
    const result = try runNullclawMemoryCommand(
        allocator,
        paths,
        instance_name,
        version,
        &.{ "memory", "store", managed_orders_bootstrap_memory_key, bytes, "--category", "core", "--json" },
    );
    defer allocator.free(result.stderr);
    defer allocator.free(result.stdout);
    if (!result.success) return error.BootstrapProviderWriteFailed;
}

fn runNullclawMemoryCommand(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    instance_name: []const u8,
    version: []const u8,
    args: []const []const u8,
) !component_cli.RunResult {
    const bin_path = try paths.binary(allocator, "nullclaw", version);
    defer allocator.free(bin_path);
    const inst_dir = try paths.instanceDir(allocator, "nullclaw", instance_name);
    defer allocator.free(inst_dir);

    return component_cli.runWithComponentHomeLimitedTimeout(
        allocator,
        "nullclaw",
        bin_path,
        args,
        null,
        inst_dir,
        nullclaw_provider_sync_output_limit,
        nullclaw_provider_sync_timeout_ms,
    );
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
        .goal = try allocator.dupe(u8, order.goal),
        .status = try allocator.dupe(u8, order.status),
        .schedule = try allocator.dupe(u8, order.schedule),
        .doc_path = try allocator.dupe(u8, order.doc_path),
        .content = try allocator.dupe(u8, order.content),
        .created_at_ms = order.created_at_ms,
        .updated_at_ms = order.updated_at_ms,
    };
}

fn writeTestNullclawConfig(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    instance_name: []const u8,
    config_json: []const u8,
) !void {
    const inst_dir = try paths.instanceDir(allocator, "nullclaw", instance_name);
    defer allocator.free(inst_dir);
    try std_compat.fs.makePathAbsolute(inst_dir);

    const config_path = try paths.instanceConfig(allocator, "nullclaw", instance_name);
    defer allocator.free(config_path);
    try writeFileAtomically(allocator, config_path, config_json);
}

fn stageProviderBootstrapCliFixture(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
) !void {
    try paths.ensureDirs();
    const bin_path = try paths.binary(allocator, "nullclaw", "dev-local");
    defer allocator.free(bin_path);

    const script =
        "#!/bin/sh\n" ++
        "set -eu\n" ++
        "if [ \"${1:-}\" = \"memory\" ] && [ \"${2:-}\" = \"get\" ]; then\n" ++
        "  printf '%s\\n' 'null'\n" ++
        "  exit 0\n" ++
        "fi\n" ++
        "if [ \"${1:-}\" = \"memory\" ] && [ \"${2:-}\" = \"store\" ]; then\n" ++
        "  printf '%s' \"$3\" > \"$NULLCLAW_HOME/provider-key.txt\"\n" ++
        "  printf '%s' \"$4\" > \"$NULLCLAW_HOME/provider-content.txt\"\n" ++
        "  printf '%s\\n' '{\"action\":\"store\",\"entry\":{\"key\":\"__bootstrap.prompt.CONFIG.md\",\"category\":\"core\",\"timestamp\":\"now\",\"content\":\"\",\"session_id\":null}}'\n" ++
        "  exit 0\n" ++
        "fi\n" ++
        "exit 1\n";
    try writeFileAtomically(allocator, bin_path, script);
    if (comptime std_compat.fs.has_executable_bit) {
        const file = try std_compat.fs.openFileAbsolute(bin_path, .{});
        defer file.close();
        try file.chmod(0o755);
    }
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

test "managed ORDERS.md sync updates provider-backed CONFIG bootstrap storage" {
    if (comptime builtin.os.tag == .windows) return error.SkipZigTest;

    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try state.addInstance("nullclaw", "ops-agent", .{ .version = "dev-local", .space_id = "ops" });
    try writeTestNullclawConfig(
        allocator,
        fixture.paths,
        "ops-agent",
        "{\"memory\":{\"backend\":\"sqlite\"}}\n",
    );
    try stageProviderBootstrapCliFixture(allocator, fixture.paths);

    var order = try orders_mod.create(allocator, fixture.paths, "ops", .{
        .id = "policy-provider",
        .title = "Provider-backed policy",
        .kind = "policy",
        .content = "Provider-backed agents must receive active policies.",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer order.deinit(allocator);
    var active = try orders_mod.transition(allocator, fixture.paths, "ops", "policy-provider", .activate, 1100);
    defer active.deinit(allocator);

    const synced = try syncManagedOrdersForSpace(allocator, fixture.paths, &state, "ops");
    try std.testing.expectEqual(@as(usize, 1), synced.workspaces_updated);
    try std.testing.expectEqual(@as(usize, 0), synced.bootstrap_file_updates);
    try std.testing.expectEqual(@as(usize, 1), synced.bootstrap_provider_updates);
    try std.testing.expectEqual(@as(usize, 0), synced.unsupported_bootstrap_count);

    const inst_dir = try fixture.paths.instanceDir(allocator, "nullclaw", "ops-agent");
    defer allocator.free(inst_dir);
    const provider_key_path = try std.fs.path.join(allocator, &.{ inst_dir, "provider-key.txt" });
    defer allocator.free(provider_key_path);
    const provider_content_path = try std.fs.path.join(allocator, &.{ inst_dir, "provider-content.txt" });
    defer allocator.free(provider_content_path);

    const provider_key = try std_compat.fs.readFileAbsolute(allocator, provider_key_path, 1024);
    defer allocator.free(provider_key);
    try std.testing.expectEqualStrings(managed_orders_bootstrap_memory_key, provider_key);

    const provider_content = try std_compat.fs.readFileAbsolute(allocator, provider_content_path, managed_orders_budget_bytes + 4096);
    defer allocator.free(provider_content);
    try std.testing.expect(std.mem.indexOf(u8, provider_content, "NULLHUB:MANAGED_POLICY_ORDERS:BEGIN") != null);
    try std.testing.expect(std.mem.indexOf(u8, provider_content, "Provider-backed agents must receive active policies.") != null);
}

test "managed ORDERS.md sync reports unsupported no-op bootstrap backend" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    try state.addInstance("nullclaw", "ops-agent", .{ .version = "dev-local", .space_id = "ops" });
    try writeTestNullclawConfig(
        allocator,
        fixture.paths,
        "ops-agent",
        "{\"memory\":{\"backend\":\"none\"}}\n",
    );

    var order = try orders_mod.create(allocator, fixture.paths, "ops", .{
        .id = "policy-noop",
        .title = "No-op backend policy",
        .kind = "policy",
        .content = "No-op backend policies still write managed files.",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer order.deinit(allocator);
    var active = try orders_mod.transition(allocator, fixture.paths, "ops", "policy-noop", .activate, 1100);
    defer active.deinit(allocator);

    const synced = try syncManagedOrdersForSpace(allocator, fixture.paths, &state, "ops");
    try std.testing.expectEqual(@as(usize, 1), synced.workspaces_updated);
    try std.testing.expectEqual(@as(usize, 0), synced.bootstrap_file_updates);
    try std.testing.expectEqual(@as(usize, 0), synced.bootstrap_provider_updates);
    try std.testing.expectEqual(@as(usize, 1), synced.unsupported_bootstrap_count);

    const orders_bytes = try readWorkspaceOrders(allocator, fixture.paths, "ops-agent");
    defer allocator.free(orders_bytes);
    try std.testing.expect(std.mem.indexOf(u8, orders_bytes, "No-op backend policies still write managed files.") != null);

    const config_bytes = try readWorkspaceBootstrapOrders(allocator, fixture.paths, "ops-agent");
    defer allocator.free(config_bytes);
    try std.testing.expect(std.mem.indexOf(u8, config_bytes, "No-op backend policies still write managed files.") != null);
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
