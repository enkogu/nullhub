const std = @import("std");
const std_compat = @import("compat");
const paths_mod = @import("paths.zig");
const test_helpers = @import("../test_helpers.zig");

pub const Status = enum {
    draft,
    active,
    suspended,
    archived,

    pub fn fromString(value: []const u8) ?Status {
        if (std.mem.eql(u8, value, "draft")) return .draft;
        if (std.mem.eql(u8, value, "active")) return .active;
        if (std.mem.eql(u8, value, "suspended")) return .suspended;
        if (std.mem.eql(u8, value, "archived")) return .archived;
        return null;
    }

    pub fn string(self: Status) []const u8 {
        return switch (self) {
            .draft => "draft",
            .active => "active",
            .suspended => "suspended",
            .archived => "archived",
        };
    }
};

pub const Transition = enum {
    draft,
    enact,
    pause_order,
    resume_order,
    archive,

    pub fn fromString(value: []const u8) ?Transition {
        if (std.mem.eql(u8, value, "draft")) return .draft;
        if (std.mem.eql(u8, value, "enact") or std.mem.eql(u8, value, "activate")) return .enact;
        if (std.mem.eql(u8, value, "suspend") or std.mem.eql(u8, value, "pause")) return .pause_order;
        if (std.mem.eql(u8, value, "resume")) return .resume_order;
        if (std.mem.eql(u8, value, "archive")) return .archive;
        return null;
    }

    pub fn status(self: Transition) Status {
        return switch (self) {
            .draft => .draft,
            .enact => .active,
            .pause_order => .suspended,
            .resume_order => .active,
            .archive => .archived,
        };
    }

    pub fn eventType(self: Transition) []const u8 {
        return switch (self) {
            .draft => "order.drafted",
            .enact => "order.enacted",
            .pause_order => "order.suspended",
            .resume_order => "order.resumed",
            .archive => "order.archived",
        };
    }
};

pub const Order = struct {
    id: []const u8,
    space_id: []const u8,
    title: []const u8,
    summary: []const u8 = "",
    kind: []const u8 = "mandate",
    status: []const u8 = "draft",
    schedule: []const u8 = "",
    doc_path: []const u8 = "",
    content: []const u8 = "",
    created_at_ms: i64,
    updated_at_ms: i64,

    pub fn deinit(self: Order, allocator: std.mem.Allocator) void {
        allocator.free(self.id);
        allocator.free(self.space_id);
        allocator.free(self.title);
        allocator.free(self.summary);
        allocator.free(self.kind);
        allocator.free(self.status);
        allocator.free(self.schedule);
        allocator.free(self.doc_path);
        allocator.free(self.content);
    }
};

pub const OrderInput = struct {
    id: []const u8 = "",
    title: []const u8,
    summary: []const u8 = "",
    kind: []const u8 = "mandate",
    schedule: []const u8 = "",
    content: []const u8 = "",
    created_at_ms: i64,
    updated_at_ms: i64,
};

pub const OrderUpdate = struct {
    title: ?[]const u8 = null,
    summary: ?[]const u8 = null,
    kind: ?[]const u8 = null,
    schedule: ?[]const u8 = null,
    content: ?[]const u8 = null,
    status: ?Status = null,
    updated_at_ms: i64,
};

pub const StoreError = anyerror;

const Table = struct {
    orders: []const Order = &.{},
};

const LoadedTable = struct {
    allocator: std.mem.Allocator,
    orders: []Order,

    fn deinit(self: *LoadedTable) void {
        for (self.orders) |order| order.deinit(self.allocator);
        self.allocator.free(self.orders);
        self.* = undefined;
    }
};

pub fn isValidOrderId(id: []const u8) bool {
    if (id.len == 0 or id.len > 96) return false;
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

pub fn list(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8) StoreError![]Order {
    var table = try loadTable(allocator, paths, space_id);
    defer table.deinit();

    const result = try allocator.alloc(Order, table.orders.len);
    errdefer allocator.free(result);
    for (table.orders, 0..) |order, idx| {
        result[idx] = try cloneOrder(allocator, order);
        errdefer {
            for (result[0..idx]) |owned| owned.deinit(allocator);
        }
    }
    return result;
}

pub fn get(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, order_id: []const u8) StoreError!Order {
    if (!isValidOrderId(order_id)) return error.InvalidOrderId;
    var table = try loadTable(allocator, paths, space_id);
    defer table.deinit();
    for (table.orders) |order| {
        if (std.mem.eql(u8, order.id, order_id)) return try cloneOrder(allocator, order);
    }
    return error.OrderNotFound;
}

pub fn create(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, input: OrderInput) StoreError!Order {
    var table = try loadTable(allocator, paths, space_id);
    defer table.deinit();

    const requested_id = std.mem.trim(u8, input.id, &std.ascii.whitespace);
    const id = if (requested_id.len > 0)
        requested_id
    else
        try nextOrderId(allocator, table.orders);
    defer if (requested_id.len == 0) allocator.free(id);

    if (!isValidOrderId(id)) return error.InvalidOrderId;
    for (table.orders) |order| {
        if (std.mem.eql(u8, order.id, id)) return error.DuplicateOrder;
    }

    const doc_path = try paths.spaceOrderDoc(allocator, space_id, id);
    defer allocator.free(doc_path);
    const rel_doc_path = try std.fmt.allocPrint(allocator, "orders/{s}.md", .{id});
    defer allocator.free(rel_doc_path);

    var order = try ownedOrder(allocator, .{
        .id = id,
        .space_id = space_id,
        .title = input.title,
        .summary = input.summary,
        .kind = if (input.kind.len > 0) input.kind else "mandate",
        .status = "draft",
        .schedule = input.schedule,
        .doc_path = rel_doc_path,
        .content = input.content,
        .created_at_ms = input.created_at_ms,
        .updated_at_ms = input.updated_at_ms,
    });
    errdefer order.deinit(allocator);

    var orders = try allocator.alloc(Order, table.orders.len + 1);
    errdefer allocator.free(orders);
    for (table.orders, 0..) |existing, idx| {
        orders[idx] = try cloneOrder(allocator, existing);
    }
    orders[table.orders.len] = try cloneOrder(allocator, order);

    var replacement = LoadedTable{ .allocator = allocator, .orders = orders };
    defer replacement.deinit();
    try saveAll(allocator, paths, space_id, replacement.orders);

    return order;
}

pub fn update(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, order_id: []const u8, update_fields: OrderUpdate) StoreError!Order {
    if (!isValidOrderId(order_id)) return error.InvalidOrderId;
    var table = try loadTable(allocator, paths, space_id);
    defer table.deinit();

    var found_idx: ?usize = null;
    for (table.orders, 0..) |order, idx| {
        if (std.mem.eql(u8, order.id, order_id)) {
            found_idx = idx;
            break;
        }
    }
    const idx = found_idx orelse return error.OrderNotFound;

    var updated = try ownedOrder(allocator, .{
        .id = table.orders[idx].id,
        .space_id = table.orders[idx].space_id,
        .title = update_fields.title orelse table.orders[idx].title,
        .summary = update_fields.summary orelse table.orders[idx].summary,
        .kind = update_fields.kind orelse table.orders[idx].kind,
        .status = if (update_fields.status) |status| status.string() else table.orders[idx].status,
        .schedule = update_fields.schedule orelse table.orders[idx].schedule,
        .doc_path = table.orders[idx].doc_path,
        .content = update_fields.content orelse table.orders[idx].content,
        .created_at_ms = table.orders[idx].created_at_ms,
        .updated_at_ms = update_fields.updated_at_ms,
    });
    errdefer updated.deinit(allocator);

    var orders = try allocator.alloc(Order, table.orders.len);
    errdefer allocator.free(orders);
    for (table.orders, 0..) |existing, copy_idx| {
        orders[copy_idx] = if (copy_idx == idx)
            try cloneOrder(allocator, updated)
        else
            try cloneOrder(allocator, existing);
    }

    var replacement = LoadedTable{ .allocator = allocator, .orders = orders };
    defer replacement.deinit();
    try saveAll(allocator, paths, space_id, replacement.orders);

    return updated;
}

pub fn transition(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, order_id: []const u8, action: Transition, now_ms: i64) StoreError!Order {
    return update(allocator, paths, space_id, order_id, .{
        .status = action.status(),
        .updated_at_ms = now_ms,
    });
}

pub fn schedule(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, order_id: []const u8, value: []const u8, now_ms: i64) StoreError!Order {
    return update(allocator, paths, space_id, order_id, .{
        .schedule = value,
        .updated_at_ms = now_ms,
    });
}

pub fn renderMarkdown(allocator: std.mem.Allocator, order: Order) ![]const u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();

    try buf.appendSlice("---\n");
    try appendFrontmatterLine(&buf, "id", order.id);
    try appendFrontmatterLine(&buf, "space_id", order.space_id);
    try appendFrontmatterLine(&buf, "title", order.title);
    try appendFrontmatterLine(&buf, "summary", order.summary);
    try appendFrontmatterLine(&buf, "kind", order.kind);
    try appendFrontmatterLine(&buf, "status", order.status);
    try appendFrontmatterLine(&buf, "schedule", order.schedule);
    try appendFrontmatterLine(&buf, "doc_path", order.doc_path);
    try appendFmt(&buf, "created_at_ms: {d}\n", .{order.created_at_ms});
    try appendFmt(&buf, "updated_at_ms: {d}\n", .{order.updated_at_ms});
    try buf.appendSlice("---\n");
    try buf.appendSlice(order.content);
    return buf.toOwnedSlice();
}

pub fn parseMarkdown(allocator: std.mem.Allocator, bytes: []const u8) StoreError!Order {
    if (!std.mem.startsWith(u8, bytes, "---\n")) return error.InvalidStatus;
    const end = std.mem.indexOf(u8, bytes[4..], "\n---\n") orelse return error.InvalidStatus;
    const frontmatter = bytes[4 .. 4 + end];
    const content = bytes[4 + end + "\n---\n".len ..];

    var parsed = ParsedFrontmatter{};
    var lines = std.mem.splitScalar(u8, frontmatter, '\n');
    while (lines.next()) |raw_line| {
        const line = std.mem.trim(u8, raw_line, " \r\t");
        if (line.len == 0) continue;
        const sep = std.mem.indexOfScalar(u8, line, ':') orelse continue;
        const key = std.mem.trim(u8, line[0..sep], " \r\t");
        const value = std.mem.trim(u8, line[sep + 1 ..], " \r\t");
        parsed.set(key, value);
    }

    if (Status.fromString(parsed.status orelse "") == null) return error.InvalidStatus;
    return ownedOrder(allocator, .{
        .id = parsed.id orelse return error.InvalidOrderId,
        .space_id = parsed.space_id orelse "",
        .title = parsed.title orelse "",
        .summary = parsed.summary orelse "",
        .kind = parsed.kind orelse "mandate",
        .status = parsed.status orelse "draft",
        .schedule = parsed.schedule orelse "",
        .doc_path = parsed.doc_path orelse "",
        .content = content,
        .created_at_ms = parsed.created_at_ms,
        .updated_at_ms = parsed.updated_at_ms,
    });
}

const ParsedFrontmatter = struct {
    id: ?[]const u8 = null,
    space_id: ?[]const u8 = null,
    title: ?[]const u8 = null,
    summary: ?[]const u8 = null,
    kind: ?[]const u8 = null,
    status: ?[]const u8 = null,
    schedule: ?[]const u8 = null,
    doc_path: ?[]const u8 = null,
    created_at_ms: i64 = 0,
    updated_at_ms: i64 = 0,

    fn set(self: *ParsedFrontmatter, key: []const u8, value: []const u8) void {
        if (std.mem.eql(u8, key, "id")) self.id = value;
        if (std.mem.eql(u8, key, "space_id")) self.space_id = value;
        if (std.mem.eql(u8, key, "title")) self.title = value;
        if (std.mem.eql(u8, key, "summary")) self.summary = value;
        if (std.mem.eql(u8, key, "kind")) self.kind = value;
        if (std.mem.eql(u8, key, "status")) self.status = value;
        if (std.mem.eql(u8, key, "schedule")) self.schedule = value;
        if (std.mem.eql(u8, key, "doc_path")) self.doc_path = value;
        if (std.mem.eql(u8, key, "created_at_ms")) self.created_at_ms = std.fmt.parseInt(i64, value, 10) catch 0;
        if (std.mem.eql(u8, key, "updated_at_ms")) self.updated_at_ms = std.fmt.parseInt(i64, value, 10) catch 0;
    }
};

fn loadTable(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8) StoreError!LoadedTable {
    const table_path = try paths.spaceOrdersTable(allocator, space_id);
    defer allocator.free(table_path);

    const bytes = blk: {
        const file = std_compat.fs.openFileAbsolute(table_path, .{}) catch |err| switch (err) {
            error.FileNotFound => return .{ .allocator = allocator, .orders = &.{} },
            else => return err,
        };
        defer file.close();
        break :blk try file.readToEndAlloc(allocator, 4 * 1024 * 1024);
    };
    defer allocator.free(bytes);

    const parsed = try std.json.parseFromSlice(Table, allocator, bytes, .{
        .allocate = .alloc_always,
        .ignore_unknown_fields = true,
    });
    defer parsed.deinit();

    const orders = try allocator.alloc(Order, parsed.value.orders.len);
    errdefer allocator.free(orders);
    for (parsed.value.orders, 0..) |order, idx| {
        orders[idx] = try cloneOrder(allocator, order);
    }
    return .{ .allocator = allocator, .orders = orders };
}

fn saveAll(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, orders: []const Order) StoreError!void {
    const orders_dir = try paths.spaceOrdersDir(allocator, space_id);
    defer allocator.free(orders_dir);
    try makeAbsolutePath(orders_dir);

    for (orders) |order| {
        const doc_path = try paths.spaceOrderDoc(allocator, space_id, order.id);
        defer allocator.free(doc_path);
        const markdown = try renderMarkdown(allocator, order);
        defer allocator.free(markdown);
        try writeFileAtomically(allocator, doc_path, markdown);
    }

    const table_path = try paths.spaceOrdersTable(allocator, space_id);
    defer allocator.free(table_path);
    const table_bytes = try std.json.Stringify.valueAlloc(allocator, Table{ .orders = orders }, .{
        .whitespace = .indent_2,
    });
    defer allocator.free(table_bytes);
    try writeFileAtomically(allocator, table_path, table_bytes);
}

fn ownedOrder(allocator: std.mem.Allocator, order: Order) !Order {
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

fn cloneOrder(allocator: std.mem.Allocator, order: Order) !Order {
    return ownedOrder(allocator, order);
}

fn nextOrderId(allocator: std.mem.Allocator, orders: []const Order) ![]u8 {
    var next: u64 = 1;
    for (orders) |order| {
        const prefix = "order-";
        if (!std.mem.startsWith(u8, order.id, prefix)) continue;
        const number = std.fmt.parseInt(u64, order.id[prefix.len..], 10) catch continue;
        if (number >= next) next = number + 1;
    }
    return std.fmt.allocPrint(allocator, "order-{d}", .{next});
}

fn appendFrontmatterLine(buf: *std.array_list.Managed(u8), key: []const u8, value: []const u8) !void {
    try buf.appendSlice(key);
    try buf.appendSlice(": ");
    try buf.appendSlice(value);
    try buf.append('\n');
}

fn appendFmt(buf: *std.array_list.Managed(u8), comptime fmt: []const u8, args: anytype) !void {
    const rendered = try std.fmt.allocPrint(buf.allocator, fmt, args);
    defer buf.allocator.free(rendered);
    try buf.appendSlice(rendered);
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
}

test "orders CRUD persists table and markdown document" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();

    const created = try create(allocator, fixture.paths, "ops", .{
        .title = "Publish daily report",
        .summary = "Send the daily operating brief.",
        .kind = "schedule",
        .schedule = "0 9 * * *",
        .content = "# Daily report\nPrepare and send the brief.\n",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer created.deinit(allocator);
    try std.testing.expectEqualStrings("order-1", created.id);
    try std.testing.expectEqualStrings("draft", created.status);

    const updated = try update(allocator, fixture.paths, "ops", created.id, .{
        .title = "Publish morning report",
        .content = "# Morning report\nUse the updated channel.\n",
        .updated_at_ms = 1100,
    });
    defer updated.deinit(allocator);
    try std.testing.expectEqualStrings("Publish morning report", updated.title);

    const loaded = try get(allocator, fixture.paths, "ops", created.id);
    defer loaded.deinit(allocator);
    try std.testing.expectEqualStrings("# Morning report\nUse the updated channel.\n", loaded.content);

    const table_path = try fixture.paths.spaceOrdersTable(allocator, "ops");
    defer allocator.free(table_path);
    const table_file = try std_compat.fs.openFileAbsolute(table_path, .{});
    table_file.close();

    const doc_path = try fixture.paths.spaceOrderDoc(allocator, "ops", "order-1");
    defer allocator.free(doc_path);
    const doc_file = try std_compat.fs.openFileAbsolute(doc_path, .{});
    defer doc_file.close();
    const bytes = try doc_file.readToEndAlloc(allocator, 64 * 1024);
    defer allocator.free(bytes);
    try std.testing.expect(std.mem.indexOf(u8, bytes, "status: draft") != null);
}

test "orders status transitions update durable status" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();

    const created = try create(allocator, fixture.paths, "ops", .{
        .title = "Keep system current",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer created.deinit(allocator);

    const enacted = try transition(allocator, fixture.paths, "ops", created.id, .enact, 1100);
    defer enacted.deinit(allocator);
    try std.testing.expectEqualStrings("active", enacted.status);

    const suspended = try transition(allocator, fixture.paths, "ops", created.id, .pause_order, 1200);
    defer suspended.deinit(allocator);
    try std.testing.expectEqualStrings("suspended", suspended.status);

    const resumed = try transition(allocator, fixture.paths, "ops", created.id, .resume_order, 1300);
    defer resumed.deinit(allocator);
    try std.testing.expectEqualStrings("active", resumed.status);

    const drafted = try transition(allocator, fixture.paths, "ops", created.id, .draft, 1400);
    defer drafted.deinit(allocator);
    try std.testing.expectEqualStrings("draft", drafted.status);

    const archived = try transition(allocator, fixture.paths, "ops", created.id, .archive, 1500);
    defer archived.deinit(allocator);
    try std.testing.expectEqualStrings("archived", archived.status);
}

test "orders markdown frontmatter round trips" {
    const allocator = std.testing.allocator;
    const original = try ownedOrder(allocator, .{
        .id = "order-7",
        .space_id = "ops",
        .title = "Watch queue",
        .summary = "Keep the queue empty.",
        .kind = "policy",
        .status = "active",
        .schedule = "event:queue.changed",
        .doc_path = "orders/order-7.md",
        .content = "# Watch queue\nEscalate blocked items.\n",
        .created_at_ms = 700,
        .updated_at_ms = 800,
    });
    defer original.deinit(allocator);

    const markdown = try renderMarkdown(allocator, original);
    defer allocator.free(markdown);
    try std.testing.expect(std.mem.indexOf(u8, markdown, "title: Watch queue") != null);

    const parsed = try parseMarkdown(allocator, markdown);
    defer parsed.deinit(allocator);
    try std.testing.expectEqualStrings(original.id, parsed.id);
    try std.testing.expectEqualStrings(original.status, parsed.status);
    try std.testing.expectEqualStrings(original.content, parsed.content);
    try std.testing.expectEqual(@as(i64, 800), parsed.updated_at_ms);
}
