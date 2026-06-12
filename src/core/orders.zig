const std = @import("std");
const std_compat = @import("compat");
const durable_file = @import("durable_file.zig");
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
    activate,
    pause,
    resume_order,
    archive,

    pub fn fromString(value: []const u8) ?Transition {
        if (std.mem.eql(u8, value, "draft")) return .draft;
        if (std.mem.eql(u8, value, "activate") or std.mem.eql(u8, value, "enact")) return .activate;
        if (std.mem.eql(u8, value, "pause") or std.mem.eql(u8, value, "suspend")) return .pause;
        if (std.mem.eql(u8, value, "resume")) return .resume_order;
        if (std.mem.eql(u8, value, "archive")) return .archive;
        return null;
    }

    pub fn status(self: Transition) Status {
        return switch (self) {
            .draft => .draft,
            .activate => .active,
            .pause => .suspended,
            .resume_order => .active,
            .archive => .archived,
        };
    }

    pub fn eventType(self: Transition) []const u8 {
        return switch (self) {
            .draft => "order.drafted",
            .activate => "order.activated",
            .pause => "order.paused",
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
    goal: []const u8 = "",
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
        allocator.free(self.goal);
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
    goal: []const u8 = "",
    schedule: []const u8 = "",
    content: []const u8 = "",
    created_at_ms: i64,
    updated_at_ms: i64,
};

pub const OrderUpdate = struct {
    title: ?[]const u8 = null,
    summary: ?[]const u8 = null,
    kind: ?[]const u8 = null,
    goal: ?[]const u8 = null,
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
        .goal = input.goal,
        .status = "draft",
        .schedule = input.schedule,
        .doc_path = rel_doc_path,
        .content = input.content,
        .created_at_ms = input.created_at_ms,
        .updated_at_ms = input.updated_at_ms,
    });
    errdefer order.deinit(allocator);

    const orders = try allocator.alloc(Order, table.orders.len + 1);
    {
        var filled: usize = 0;
        errdefer {
            for (orders[0..filled]) |owned| owned.deinit(allocator);
            allocator.free(orders);
        }
        for (table.orders) |existing| {
            orders[filled] = try cloneOrder(allocator, existing);
            filled += 1;
        }
        orders[filled] = try cloneOrder(allocator, order);
    }

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
    const next_kind = update_fields.kind orelse table.orders[idx].kind;
    const next_goal = update_fields.goal orelse table.orders[idx].goal;
    const next_status = if (update_fields.status) |status| status.string() else table.orders[idx].status;
    try validateOrderState(next_kind, next_status, next_goal);

    var updated = try ownedOrder(allocator, .{
        .id = table.orders[idx].id,
        .space_id = table.orders[idx].space_id,
        .title = update_fields.title orelse table.orders[idx].title,
        .summary = update_fields.summary orelse table.orders[idx].summary,
        .kind = next_kind,
        .goal = next_goal,
        .status = next_status,
        .schedule = update_fields.schedule orelse table.orders[idx].schedule,
        .doc_path = table.orders[idx].doc_path,
        .content = update_fields.content orelse table.orders[idx].content,
        .created_at_ms = table.orders[idx].created_at_ms,
        .updated_at_ms = update_fields.updated_at_ms,
    });
    errdefer updated.deinit(allocator);

    const orders = try allocator.alloc(Order, table.orders.len);
    {
        var filled: usize = 0;
        errdefer {
            for (orders[0..filled]) |owned| owned.deinit(allocator);
            allocator.free(orders);
        }
        for (table.orders, 0..) |existing, copy_idx| {
            orders[filled] = if (copy_idx == idx)
                try cloneOrder(allocator, updated)
            else
                try cloneOrder(allocator, existing);
            filled += 1;
        }
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

pub fn remove(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, order_id: []const u8) StoreError!Order {
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

    var removed = try cloneOrder(allocator, table.orders[idx]);
    errdefer removed.deinit(allocator);

    const orders = try allocator.alloc(Order, table.orders.len - 1);
    {
        var filled: usize = 0;
        errdefer {
            for (orders[0..filled]) |owned| owned.deinit(allocator);
            allocator.free(orders);
        }
        for (table.orders, 0..) |existing, copy_idx| {
            if (copy_idx == idx) continue;
            orders[filled] = try cloneOrder(allocator, existing);
            filled += 1;
        }
    }

    var replacement = LoadedTable{ .allocator = allocator, .orders = orders };
    defer replacement.deinit();
    try saveAll(allocator, paths, space_id, replacement.orders);

    return removed;
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
    try appendFrontmatterLine(&buf, "goal", order.goal);
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

    const raw_id = parsed.id orelse return error.InvalidOrderId;
    const id = try parseFrontmatterScalarAlloc(allocator, raw_id);
    defer allocator.free(id);
    const space_id = try parseFrontmatterScalarOrDefaultAlloc(allocator, parsed.space_id, "");
    defer allocator.free(space_id);
    const title = try parseFrontmatterScalarOrDefaultAlloc(allocator, parsed.title, "");
    defer allocator.free(title);
    const summary = try parseFrontmatterScalarOrDefaultAlloc(allocator, parsed.summary, "");
    defer allocator.free(summary);
    const kind = try parseFrontmatterScalarOrDefaultAlloc(allocator, parsed.kind, "mandate");
    defer allocator.free(kind);
    const goal = try parseFrontmatterScalarOrDefaultAlloc(allocator, parsed.goal, "");
    defer allocator.free(goal);
    const status = try parseFrontmatterScalarOrDefaultAlloc(allocator, parsed.status, "");
    defer allocator.free(status);
    const schedule_value = try parseFrontmatterScalarOrDefaultAlloc(allocator, parsed.schedule, "");
    defer allocator.free(schedule_value);
    const doc_path = try parseFrontmatterScalarOrDefaultAlloc(allocator, parsed.doc_path, "");
    defer allocator.free(doc_path);

    if (Status.fromString(status) == null) return error.InvalidStatus;
    try validateOrderState(kind, status, goal);
    return ownedOrder(allocator, .{
        .id = id,
        .space_id = space_id,
        .title = title,
        .summary = summary,
        .kind = kind,
        .goal = goal,
        .status = status,
        .schedule = schedule_value,
        .doc_path = doc_path,
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
    goal: ?[]const u8 = null,
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
        if (std.mem.eql(u8, key, "goal") or std.mem.eql(u8, key, "goal_id") or std.mem.eql(u8, key, "goal_ref")) self.goal = value;
        if (std.mem.eql(u8, key, "status")) self.status = value;
        if (std.mem.eql(u8, key, "schedule")) self.schedule = value;
        if (std.mem.eql(u8, key, "doc_path")) self.doc_path = value;
        if (std.mem.eql(u8, key, "created_at_ms")) self.created_at_ms = std.fmt.parseInt(i64, value, 10) catch 0;
        if (std.mem.eql(u8, key, "updated_at_ms")) self.updated_at_ms = std.fmt.parseInt(i64, value, 10) catch 0;
    }
};

fn loadTable(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8) StoreError!LoadedTable {
    var docs = try loadMarkdownDocs(allocator, paths, space_id);
    if (docs.orders.len > 0) {
        errdefer docs.deinit();
        try saveJsonTable(allocator, paths, space_id, docs.orders);
        return docs;
    }
    docs.deinit();

    return loadJsonTable(allocator, paths, space_id);
}

fn loadMarkdownDocs(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8) StoreError!LoadedTable {
    const orders_dir = try paths.spaceOrdersDir(allocator, space_id);
    defer allocator.free(orders_dir);

    var dir = std_compat.fs.openDirAbsolute(orders_dir, .{ .iterate = true }) catch |err| switch (err) {
        error.FileNotFound => return .{ .allocator = allocator, .orders = &.{} },
        else => return err,
    };
    defer dir.close();

    var parsed_orders = std.array_list.Managed(Order).init(allocator);
    errdefer {
        for (parsed_orders.items) |order| order.deinit(allocator);
        parsed_orders.deinit();
    }

    var it = dir.iterate();
    while (try it.next()) |entry| {
        if (entry.kind != .file) continue;
        if (!std.mem.endsWith(u8, entry.name, ".md")) continue;

        const doc_path = try std.fs.path.join(allocator, &.{ orders_dir, entry.name });
        defer allocator.free(doc_path);

        const file = try std_compat.fs.openFileAbsolute(doc_path, .{});
        defer file.close();
        const bytes = try file.readToEndAlloc(allocator, 4 * 1024 * 1024);
        defer allocator.free(bytes);

        var order = try parseMarkdown(allocator, bytes);
        errdefer order.deinit(allocator);
        if (!isValidOrderId(order.id)) return error.InvalidOrderId;
        if (!std.mem.eql(u8, order.space_id, space_id)) return error.InvalidSpaceId;
        try parsed_orders.append(order);
    }

    std.mem.sort(Order, parsed_orders.items, {}, orderIdLessThan);
    return .{ .allocator = allocator, .orders = try parsed_orders.toOwnedSlice() };
}

fn loadJsonTable(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8) StoreError!LoadedTable {
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
    try deleteStaleMarkdownDocs(allocator, orders_dir, orders);

    try saveJsonTable(allocator, paths, space_id, orders);
}

fn saveJsonTable(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, orders: []const Order) StoreError!void {
    const table_path = try paths.spaceOrdersTable(allocator, space_id);
    defer allocator.free(table_path);
    const table_bytes = try std.json.Stringify.valueAlloc(allocator, Table{ .orders = orders }, .{
        .whitespace = .indent_2,
    });
    defer allocator.free(table_bytes);
    try writeFileAtomically(allocator, table_path, table_bytes);
}

fn deleteStaleMarkdownDocs(allocator: std.mem.Allocator, orders_dir: []const u8, orders: []const Order) !void {
    var dir = std_compat.fs.openDirAbsolute(orders_dir, .{ .iterate = true }) catch |err| switch (err) {
        error.FileNotFound => return,
        else => return err,
    };
    defer dir.close();

    var it = dir.iterate();
    while (try it.next()) |entry| {
        if (entry.kind != .file) continue;
        if (!std.mem.endsWith(u8, entry.name, ".md")) continue;
        const id = entry.name[0 .. entry.name.len - ".md".len];
        if (!isValidOrderId(id) or containsOrderId(orders, id)) continue;

        const doc_path = try std.fs.path.join(allocator, &.{ orders_dir, entry.name });
        defer allocator.free(doc_path);
        std_compat.fs.deleteFileAbsolute(doc_path) catch |err| switch (err) {
            error.FileNotFound => {},
            else => return err,
        };
    }
}

fn containsOrderId(orders: []const Order, id: []const u8) bool {
    for (orders) |order| {
        if (std.mem.eql(u8, order.id, id)) return true;
    }
    return false;
}

fn orderIdLessThan(_: void, left: Order, right: Order) bool {
    return std.mem.order(u8, left.id, right.id) == .lt;
}

fn ownedOrder(allocator: std.mem.Allocator, order: Order) !Order {
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

fn cloneOrder(allocator: std.mem.Allocator, order: Order) !Order {
    return ownedOrder(allocator, order);
}

fn validateOrderState(kind: []const u8, status: []const u8, goal: []const u8) !void {
    if (!std.ascii.eqlIgnoreCase(kind, "mandate")) return;
    if (!std.mem.eql(u8, status, Status.active.string())) return;
    if (std.mem.trim(u8, goal, &std.ascii.whitespace).len == 0) return error.MissingMandateGoal;
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
    try appendYamlQuotedScalar(buf, value);
    try buf.append('\n');
}

fn appendYamlQuotedScalar(buf: *std.array_list.Managed(u8), value: []const u8) !void {
    try buf.append('"');
    for (value) |byte| {
        switch (byte) {
            '"' => try buf.appendSlice("\\\""),
            '\\' => try buf.appendSlice("\\\\"),
            '\n' => try buf.appendSlice("\\n"),
            '\r' => try buf.appendSlice("\\r"),
            '\t' => try buf.appendSlice("\\t"),
            else => try buf.append(byte),
        }
    }
    try buf.append('"');
}

fn parseFrontmatterScalarOrDefaultAlloc(allocator: std.mem.Allocator, value: ?[]const u8, default_value: []const u8) ![]u8 {
    return parseFrontmatterScalarAlloc(allocator, value orelse default_value);
}

fn parseFrontmatterScalarAlloc(allocator: std.mem.Allocator, raw_value: []const u8) ![]u8 {
    const value = std.mem.trim(u8, raw_value, " \r\t");
    if (value.len == 0 or value[0] != '"') return allocator.dupe(u8, value);
    if (value.len < 2 or value[value.len - 1] != '"') return error.InvalidFrontmatterScalar;

    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();

    var idx: usize = 1;
    while (idx < value.len - 1) : (idx += 1) {
        const byte = value[idx];
        if (byte != '\\') {
            try buf.append(byte);
            continue;
        }
        idx += 1;
        if (idx >= value.len - 1) return error.InvalidFrontmatterScalar;
        try buf.append(switch (value[idx]) {
            '"' => '"',
            '\\' => '\\',
            'n' => '\n',
            'r' => '\r',
            't' => '\t',
            else => return error.InvalidFrontmatterScalar,
        });
    }

    return buf.toOwnedSlice();
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
    try durable_file.syncDirectory(dir_path);
}

fn expectFileNotFound(path: []const u8) !void {
    if (std_compat.fs.openFileAbsolute(path, .{})) |file| {
        file.close();
        return error.ExpectedFileNotFound;
    } else |err| {
        try std.testing.expectEqual(error.FileNotFound, err);
    }
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
    try std.testing.expect(std.mem.indexOf(u8, bytes, "status: \"draft\"") != null);
}

test "orders reads markdown documents before derived orders table" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();

    const created = try create(allocator, fixture.paths, "ops", .{
        .title = "JSON title",
        .summary = "Stale table summary.",
        .kind = "policy",
        .content = "# Original\n",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer created.deinit(allocator);

    const doc_first = try ownedOrder(allocator, .{
        .id = created.id,
        .space_id = "ops",
        .title = "Markdown title",
        .summary = "Markdown summary.",
        .kind = "mandate",
        .goal = "queue-empty",
        .status = "active",
        .schedule = "event:queue.changed",
        .doc_path = created.doc_path,
        .content = "# Markdown body\nThis edit bypassed orders.json.\n",
        .created_at_ms = created.created_at_ms,
        .updated_at_ms = 2000,
    });
    defer doc_first.deinit(allocator);

    const doc_path = try fixture.paths.spaceOrderDoc(allocator, "ops", created.id);
    defer allocator.free(doc_path);
    const markdown = try renderMarkdown(allocator, doc_first);
    defer allocator.free(markdown);
    try writeFileAtomically(allocator, doc_path, markdown);

    const listed = try list(allocator, fixture.paths, "ops");
    defer {
        for (listed) |order| order.deinit(allocator);
        allocator.free(listed);
    }
    try std.testing.expectEqual(@as(usize, 1), listed.len);
    try std.testing.expectEqualStrings("Markdown title", listed[0].title);
    try std.testing.expectEqualStrings("active", listed[0].status);

    var derived_after_list = try loadJsonTable(allocator, fixture.paths, "ops");
    defer derived_after_list.deinit();
    try std.testing.expectEqual(@as(usize, 1), derived_after_list.orders.len);
    try std.testing.expectEqualStrings("Markdown title", derived_after_list.orders[0].title);
    try std.testing.expectEqualStrings("active", derived_after_list.orders[0].status);
    try std.testing.expectEqualStrings("# Markdown body\nThis edit bypassed orders.json.\n", derived_after_list.orders[0].content);

    const loaded = try get(allocator, fixture.paths, "ops", created.id);
    defer loaded.deinit(allocator);
    try std.testing.expectEqualStrings("Markdown summary.", loaded.summary);
    try std.testing.expectEqualStrings("# Markdown body\nThis edit bypassed orders.json.\n", loaded.content);

    const updated = try update(allocator, fixture.paths, "ops", created.id, .{
        .summary = "Updated from markdown source.",
        .updated_at_ms = 3000,
    });
    defer updated.deinit(allocator);
    try std.testing.expectEqualStrings("Markdown title", updated.title);
    try std.testing.expectEqualStrings("Updated from markdown source.", updated.summary);
    try std.testing.expectEqualStrings("# Markdown body\nThis edit bypassed orders.json.\n", updated.content);
}

test "orders remove deletes markdown document and derived table row" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();

    const created = try create(allocator, fixture.paths, "ops", .{
        .title = "Delete me",
        .content = "# Delete me\n",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer created.deinit(allocator);

    const archived = try transition(allocator, fixture.paths, "ops", created.id, .archive, 1100);
    defer archived.deinit(allocator);
    try std.testing.expectEqualStrings("archived", archived.status);

    const still_present = try get(allocator, fixture.paths, "ops", created.id);
    defer still_present.deinit(allocator);
    try std.testing.expectEqualStrings("archived", still_present.status);

    const removed = try remove(allocator, fixture.paths, "ops", created.id);
    defer removed.deinit(allocator);
    try std.testing.expectEqualStrings(created.id, removed.id);
    try std.testing.expectEqualStrings("archived", removed.status);

    try std.testing.expectError(error.OrderNotFound, get(allocator, fixture.paths, "ops", created.id));

    const doc_path = try fixture.paths.spaceOrderDoc(allocator, "ops", created.id);
    defer allocator.free(doc_path);
    try expectFileNotFound(doc_path);

    const loaded = try list(allocator, fixture.paths, "ops");
    defer allocator.free(loaded);
    try std.testing.expectEqual(@as(usize, 0), loaded.len);
}

test "orders create returns clean error when table save fails" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();

    const orders_dir = try fixture.paths.spaceOrdersDir(allocator, "ops");
    defer allocator.free(orders_dir);
    try std_compat.fs.makePathAbsolute(orders_dir);

    const table_path = try fixture.paths.spaceOrdersTable(allocator, "ops");
    defer allocator.free(table_path);
    try std_compat.fs.makeDirAbsolute(table_path);

    if (create(allocator, fixture.paths, "ops", .{
        .title = "Blocked table write",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    })) |order| {
        defer order.deinit(allocator);
        return error.ExpectedSaveFailure;
    } else |_| {}
}

test "orders status transitions update durable status" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();

    const created = try create(allocator, fixture.paths, "ops", .{
        .title = "Keep system current",
        .goal = "system-current",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer created.deinit(allocator);

    const enacted = try transition(allocator, fixture.paths, "ops", created.id, .activate, 1100);
    defer enacted.deinit(allocator);
    try std.testing.expectEqualStrings("active", enacted.status);

    const suspended = try transition(allocator, fixture.paths, "ops", created.id, .pause, 1200);
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

test "orders require a goal before mandate activation" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();

    const created = try create(allocator, fixture.paths, "ops", .{
        .title = "Reach subscriber target",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer created.deinit(allocator);

    try std.testing.expectError(error.MissingMandateGoal, transition(allocator, fixture.paths, "ops", created.id, .activate, 1100));

    const goal_bound = try update(allocator, fixture.paths, "ops", created.id, .{
        .goal = "subscribers-50",
        .updated_at_ms = 1200,
    });
    defer goal_bound.deinit(allocator);
    try std.testing.expectEqualStrings("subscribers-50", goal_bound.goal);

    const active = try transition(allocator, fixture.paths, "ops", created.id, .activate, 1300);
    defer active.deinit(allocator);
    try std.testing.expectEqualStrings("active", active.status);
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
    try std.testing.expect(std.mem.indexOf(u8, markdown, "title: \"Watch queue\"") != null);

    const parsed = try parseMarkdown(allocator, markdown);
    defer parsed.deinit(allocator);
    try std.testing.expectEqualStrings(original.id, parsed.id);
    try std.testing.expectEqualStrings(original.goal, parsed.goal);
    try std.testing.expectEqualStrings(original.status, parsed.status);
    try std.testing.expectEqualStrings(original.content, parsed.content);
    try std.testing.expectEqual(@as(i64, 800), parsed.updated_at_ms);
}

test "orders markdown frontmatter escapes hostile scalar values" {
    const allocator = std.testing.allocator;
    const original = try ownedOrder(allocator, .{
        .id = "order-8",
        .space_id = "ops",
        .title = "Quoted \"title\"\nstatus: archived",
        .summary = "Summary line\n---\nforged: block",
        .kind = "policy",
        .status = "active",
        .schedule = "cron \"daily\"\nstatus: archived\n---",
        .doc_path = "orders/order-8.md",
        .content = "# Hostile values stay in fields\n",
        .created_at_ms = 900,
        .updated_at_ms = 950,
    });
    defer original.deinit(allocator);

    const markdown = try renderMarkdown(allocator, original);
    defer allocator.free(markdown);
    try std.testing.expect(std.mem.indexOf(u8, markdown, "\nstatus: archived\n") == null);

    const parsed = try parseMarkdown(allocator, markdown);
    defer parsed.deinit(allocator);
    try std.testing.expectEqualStrings(original.title, parsed.title);
    try std.testing.expectEqualStrings(original.summary, parsed.summary);
    try std.testing.expectEqualStrings(original.schedule, parsed.schedule);
    try std.testing.expectEqualStrings("active", parsed.status);
    try std.testing.expectEqualStrings(original.content, parsed.content);
}
