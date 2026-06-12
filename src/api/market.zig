const std = @import("std");
const std_compat = @import("compat");
const build_options = @import("build_options");
const durable_file = @import("../core/durable_file.zig");
const orders_mod = @import("../core/orders.zig");
const paths_mod = @import("../core/paths.zig");
const state_mod = @import("../core/state.zig");
const helpers = @import("helpers.zig");
const channels_api = @import("channels.zig");
const query = @import("query.zig");
const spaces_api = @import("spaces.zig");

const appendEscaped = helpers.appendEscaped;
const max_manifest_bytes: usize = 512 * 1024;
const max_export_body_bytes: usize = 512 * 1024;

pub const builtin_catalog_dir = "market/catalog";

pub const Scale = enum {
    component,
    kit,
    blueprint,

    pub fn fromString(value: []const u8) ?Scale {
        if (std.mem.eql(u8, value, "component")) return .component;
        if (std.mem.eql(u8, value, "kit")) return .kit;
        if (std.mem.eql(u8, value, "blueprint")) return .blueprint;
        return null;
    }
};

const ExportScope = enum {
    space,
    selection,
    single,

    fn fromString(value: []const u8) ?ExportScope {
        if (std.mem.eql(u8, value, "space")) return .space;
        if (std.mem.eql(u8, value, "selection")) return .selection;
        if (std.mem.eql(u8, value, "single")) return .single;
        return null;
    }

    fn defaultScale(self: ExportScope) Scale {
        return switch (self) {
            .space => .blueprint,
            .selection => .kit,
            .single => .component,
        };
    }

    fn string(self: ExportScope) []const u8 {
        return switch (self) {
            .space => "space",
            .selection => "selection",
            .single => "single",
        };
    }
};

pub const ValidationError = error{
    InvalidJson,
    ManifestRootNotObject,
    MissingId,
    MissingName,
    MissingVersion,
    MissingScale,
    MissingRequires,
    MissingContributes,
    MissingConfig,
    MissingSeeds,
    MissingExtends,
    MissingCharter,
    InvalidId,
    InvalidName,
    InvalidVersion,
    InvalidScale,
    InvalidRequires,
    InvalidContributes,
    InvalidConfig,
    InvalidSeeds,
    InvalidExtends,
    InvalidCharter,
    MissingSecretRef,
    InvalidSecretRef,
    SecretValueNotAllowed,
};

pub fn isCatalogPath(target: []const u8) bool {
    const clean = query.stripTarget(target);
    return std.mem.eql(u8, clean, "/api/market/catalog");
}

pub fn isInstalledPath(target: []const u8) bool {
    const clean = query.stripTarget(target);
    return std.mem.eql(u8, clean, "/api/market/installed");
}

pub fn isExportPath(target: []const u8) bool {
    const clean = query.stripTarget(target);
    return std.mem.eql(u8, clean, "/api/market/export");
}

pub fn isLibraryDownloadPath(target: []const u8) bool {
    const clean = query.stripTarget(target);
    const prefix = "/api/market/library/";
    return std.mem.startsWith(u8, clean, prefix) and std.mem.endsWith(u8, clean, ".json");
}

pub fn libraryPackageIdFromTargetAlloc(allocator: std.mem.Allocator, target: []const u8) !?[]u8 {
    const clean = query.stripTarget(target);
    const prefix = "/api/market/library/";
    if (!std.mem.startsWith(u8, clean, prefix)) return null;
    const rest = clean[prefix.len..];
    if (!std.mem.endsWith(u8, rest, ".json")) return null;
    const encoded_id = rest[0 .. rest.len - ".json".len];
    return try query.decodePathSegmentAlloc(allocator, encoded_id);
}

pub fn validateManifestJson(allocator: std.mem.Allocator, bytes: []const u8) ValidationError!void {
    var parsed = std.json.parseFromSlice(std.json.Value, allocator, bytes, .{
        .allocate = .alloc_always,
    }) catch return error.InvalidJson;
    defer parsed.deinit();
    try validateManifestValue(parsed.value);
}

pub fn handleCatalog(allocator: std.mem.Allocator) helpers.ApiResponse {
    const catalog_dir = resolveBuiltinCatalogDir(allocator) catch return helpers.serverError();
    defer allocator.free(catalog_dir);

    const body = renderManifestDirectory(allocator, catalog_dir, false) catch return helpers.serverError();
    return helpers.jsonOk(body);
}

pub fn handleInstalled(allocator: std.mem.Allocator, paths: paths_mod.Paths, target: []const u8) helpers.ApiResponse {
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    const library_dir = paths.spacePackageLibraryDir(allocator, space_id) catch return helpers.serverError();
    defer allocator.free(library_dir);

    std_compat.fs.makePathAbsolute(library_dir) catch return helpers.serverError();
    const body = renderManifestDirectory(allocator, library_dir, true) catch return helpers.serverError();
    return helpers.jsonOk(body);
}

pub fn handleExport(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    target: []const u8,
    body: []const u8,
    now_ms: i64,
) helpers.ApiResponse {
    if (body.len > max_export_body_bytes) {
        return helpers.badRequest("{\"error\":\"export body is too large\"}");
    }

    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    const trimmed_body = std.mem.trim(u8, body, " \t\r\n");
    const json_body = if (trimmed_body.len == 0) "{}" else trimmed_body;
    var parsed = std.json.parseFromSlice(std.json.Value, allocator, json_body, .{
        .allocate = .alloc_always,
    }) catch return helpers.badRequest("{\"error\":\"invalid JSON body\"}");
    defer parsed.deinit();
    if (parsed.value != .object) return helpers.badRequest("{\"error\":\"export body must be an object\"}");
    const root = parsed.value.object;

    const scope = resolveExportScope(root) orelse return helpers.badRequest("{\"error\":\"invalid export scope\"}");
    const scale = resolveExportScale(root, scope) orelse return helpers.badRequest("{\"error\":\"invalid package scale\"}");
    const package_id = resolvePackageId(allocator, root, space_id, scale, now_ms) catch return helpers.serverError();
    defer allocator.free(package_id);
    if (!isSafePackageId(package_id)) return helpers.badRequest("{\"error\":\"invalid package id\"}");

    const manifest = buildExportManifest(allocator, paths, state, space_id, root, scope, scale, package_id, now_ms) catch |err| switch (err) {
        error.EmptySelection => return helpers.badRequest("{\"error\":\"export selection is empty\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(manifest);
    validateManifestJson(allocator, manifest) catch return helpers.serverError();

    const library_dir = paths.spacePackageLibraryDir(allocator, space_id) catch return helpers.serverError();
    defer allocator.free(library_dir);
    std_compat.fs.makePathAbsolute(library_dir) catch return helpers.serverError();

    const manifest_path = paths.spacePackageLibraryManifest(allocator, space_id, package_id) catch return helpers.serverError();
    defer allocator.free(manifest_path);
    durable_file.writeTextFileAtomically(allocator, manifest_path, manifest) catch return helpers.serverError();

    const download_url = buildDownloadUrl(allocator, space_id, package_id) catch return helpers.serverError();
    defer allocator.free(download_url);
    appendPackageExportedEvent(allocator, state, space_id, package_id, scale, manifest_path, download_url, now_ms) catch return helpers.serverError();
    state.save() catch return helpers.serverError();

    const response = renderExportResponse(allocator, package_id, manifest_path, download_url, manifest) catch return helpers.serverError();
    return .{ .status = "201 Created", .content_type = "application/json", .body = response };
}

pub fn handleLibraryDownload(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    target: []const u8,
    package_id: []const u8,
) helpers.ApiResponse {
    if (!isSafePackageId(package_id)) return helpers.badRequest("{\"error\":\"invalid package id\"}");
    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    const manifest_path = paths.spacePackageLibraryManifest(allocator, space_id, package_id) catch return helpers.serverError();
    defer allocator.free(manifest_path);
    const bytes = std_compat.fs.readFileAbsolute(allocator, manifest_path, max_manifest_bytes) catch |err| switch (err) {
        error.FileNotFound => return helpers.notFound(),
        else => return helpers.serverError(),
    };
    validateManifestJson(allocator, bytes) catch {
        allocator.free(bytes);
        return helpers.serverError();
    };
    return helpers.jsonOk(bytes);
}

fn resolveExportScope(root: std.json.ObjectMap) ?ExportScope {
    if (stringField(root, "scope")) |scope| {
        return ExportScope.fromString(scope);
    }
    if (stringField(root, "mode")) |mode| {
        return ExportScope.fromString(mode);
    }
    if (stringField(root, "scale")) |scale| {
        const parsed = Scale.fromString(scale) orelse return null;
        return switch (parsed) {
            .blueprint => .space,
            .kit => .selection,
            .component => .single,
        };
    }
    return .space;
}

fn resolveExportScale(root: std.json.ObjectMap, scope: ExportScope) ?Scale {
    if (stringField(root, "scale")) |scale| {
        const parsed = Scale.fromString(scale) orelse return null;
        if (parsed != scope.defaultScale()) return null;
        return parsed;
    }
    return scope.defaultScale();
}

fn resolvePackageId(
    allocator: std.mem.Allocator,
    root: std.json.ObjectMap,
    space_id: []const u8,
    scale: Scale,
    now_ms: i64,
) ![]u8 {
    if (stringField(root, "id")) |id| return allocator.dupe(u8, id);
    if (stringField(root, "package_id")) |id| return allocator.dupe(u8, id);
    return std.fmt.allocPrint(allocator, "export.{s}.{s}.{d}", .{ space_id, scaleString(scale), now_ms });
}

fn buildExportManifest(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    space_id: []const u8,
    root: std.json.ObjectMap,
    scope: ExportScope,
    scale: Scale,
    package_id: []const u8,
    now_ms: i64,
) ![]u8 {
    const package_name = stringField(root, "name") orelse defaultExportName(scope, scale);
    const package_version = stringField(root, "version") orelse "1.0.0";
    const summary = stringField(root, "summary") orelse defaultExportSummary(scope);
    const selection_value = root.get("selection");
    const single_value = root.get("single") orelse @as(?std.json.Value, .{ .object = root });
    const space = state.getSpace(space_id);

    var seed_count: usize = 0;
    var contribution_count: usize = 0;
    var secret_count: usize = 0;
    var extends_count: usize = 0;

    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();

    try buf.appendSlice("{\"id\":\"");
    try appendEscaped(&buf, package_id);
    try buf.appendSlice("\",\"name\":\"");
    try appendEscaped(&buf, package_name);
    try buf.appendSlice("\",\"version\":\"");
    try appendEscaped(&buf, package_version);
    try buf.appendSlice("\",\"scale\":\"");
    try buf.appendSlice(scaleString(scale));
    try buf.appendSlice("\",\"summary\":\"");
    try appendEscaped(&buf, summary);
    try buf.appendSlice("\",\"requires\":[");
    try appendProviderRequires(&buf, state, space_id, scope, selection_value, single_value, &secret_count);
    try buf.appendSlice("],\"contributes\":[");
    try appendContributions(&buf, paths, state, space_id, scope, selection_value, single_value, &contribution_count);
    try buf.appendSlice("],\"config\":{");
    try appendExportConfig(&buf, state, space_id, scope, scale, now_ms, selection_value, single_value);
    try buf.appendSlice("},\"seeds\":[");
    try appendSeeds(&buf, paths, state, space_id, scope, selection_value, single_value, &seed_count);
    try buf.appendSlice("],\"extends\":[");
    try appendSelectedPackages(&buf, selection_value, single_value, scope, &extends_count);
    try buf.appendSlice("],\"charter\":{");
    try appendCharter(&buf, space, scope, scale);
    try buf.appendSlice("}}");

    if ((scope == .selection or scope == .single) and seed_count == 0 and extends_count == 0) {
        return error.EmptySelection;
    }
    return buf.toOwnedSlice();
}

fn appendExportConfig(
    buf: *std.array_list.Managed(u8),
    state: *state_mod.State,
    space_id: []const u8,
    scope: ExportScope,
    scale: Scale,
    now_ms: i64,
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
) !void {
    try buf.appendSlice("\"export\":{\"source_space\":\"");
    try appendEscaped(buf, space_id);
    try buf.appendSlice("\",\"scope\":\"");
    try buf.appendSlice(scope.string());
    try buf.appendSlice("\",\"created_at_ms\":");
    try appendFmt(buf, "{d}", .{now_ms});
    try buf.appendSlice("},\"secrets\":[");
    var first = true;
    try appendProviderSecretRefs(buf, state, space_id, scope, selection_value, single_value, &first, null);
    try buf.appendSlice("],\"source\":{\"kind\":\"nullhub_space\",\"scale\":\"");
    try buf.appendSlice(scaleString(scale));
    try buf.appendSlice("\"}");
}

fn appendCharter(
    buf: *std.array_list.Managed(u8),
    space: ?state_mod.Space,
    scope: ExportScope,
    scale: Scale,
) !void {
    try buf.appendSlice("\"mission\":\"");
    if (space) |value| {
        try appendEscaped(buf, "Exported package from ");
        try appendEscaped(buf, value.name);
    } else {
        try appendEscaped(buf, defaultExportName(scope, scale));
    }
    try buf.appendSlice("\",\"autonomy_bounds\":[\"Export contains tenant data seeds and secret refs only\"],\"metrics\":[\"package_exports\"]");
}

fn appendProviderRequires(
    buf: *std.array_list.Managed(u8),
    state: *state_mod.State,
    space_id: []const u8,
    scope: ExportScope,
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
    count: *usize,
) !void {
    var first = true;
    try appendProviderSecretRefs(buf, state, space_id, scope, selection_value, single_value, &first, count);
}

fn appendProviderSecretRefs(
    buf: *std.array_list.Managed(u8),
    state: *state_mod.State,
    space_id: []const u8,
    scope: ExportScope,
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
    first: *bool,
    count: ?*usize,
) !void {
    for (state.savedProviders()) |provider| {
        if (!state.spaceMatches(provider.space_id, space_id)) continue;
        if (!includeProvider(scope, selection_value, single_value, provider)) continue;
        const ref = try providerSecretRef(buf.allocator, provider);
        defer buf.allocator.free(ref);
        if (!first.*) try buf.append(',');
        first.* = false;
        try buf.appendSlice("{\"kind\":\"secret_ref\",\"name\":\"");
        try appendEscaped(buf, provider.name);
        try buf.appendSlice("\",\"secret_ref\":\"");
        try appendEscaped(buf, ref);
        try buf.appendSlice("\"}");
        if (count) |ptr| ptr.* += 1;
    }
}

fn appendContributions(
    buf: *std.array_list.Managed(u8),
    paths: paths_mod.Paths,
    state: *state_mod.State,
    space_id: []const u8,
    scope: ExportScope,
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
    count: *usize,
) !void {
    var first = true;
    if (scope == .space) {
        if (state.getSpace(space_id)) |space| {
            try appendContribution(buf, &first, "space", space.name, count);
        } else {
            try appendContribution(buf, &first, "space", space_id, count);
        }
    }

    const orders = try orders_mod.list(buf.allocator, paths, space_id);
    defer {
        for (orders) |order| order.deinit(buf.allocator);
        buf.allocator.free(orders);
    }
    for (orders) |order| {
        if (!includeOrder(scope, selection_value, single_value, order.id)) continue;
        try appendContribution(buf, &first, "order", order.title, count);
    }

    var comp_it = state.instances.iterator();
    while (comp_it.next()) |component_entry| {
        const component = component_entry.key_ptr.*;
        var inst_it = component_entry.value_ptr.*.iterator();
        while (inst_it.next()) |inst_entry| {
            const instance_name = inst_entry.key_ptr.*;
            const instance = inst_entry.value_ptr.*;
            if (!state.spaceMatches(instance.space_id, space_id)) continue;
            if (!includeInstance(scope, selection_value, single_value, component, instance_name)) continue;
            const name = try std.fmt.allocPrint(buf.allocator, "{s}/{s}", .{ component, instance_name });
            defer buf.allocator.free(name);
            try appendContribution(buf, &first, "instance", name, count);
        }
    }
}

fn appendContribution(
    buf: *std.array_list.Managed(u8),
    first: *bool,
    kind: []const u8,
    name: []const u8,
    count: *usize,
) !void {
    if (!first.*) try buf.append(',');
    first.* = false;
    try buf.appendSlice("{\"kind\":\"");
    try appendEscaped(buf, kind);
    try buf.appendSlice("\",\"name\":\"");
    try appendEscaped(buf, name);
    try buf.appendSlice("\"}");
    count.* += 1;
}

fn appendSeeds(
    buf: *std.array_list.Managed(u8),
    paths: paths_mod.Paths,
    state: *state_mod.State,
    space_id: []const u8,
    scope: ExportScope,
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
    count: *usize,
) !void {
    var first = true;
    if (scope == .space) {
        try appendSpaceSeed(buf, state.getSpace(space_id), space_id, &first, count);
    }
    try appendOrderSeeds(buf, paths, space_id, scope, selection_value, single_value, &first, count);
    try appendInstanceSeeds(buf, state, space_id, scope, selection_value, single_value, &first, count);
    try appendProviderSeeds(buf, state, space_id, scope, selection_value, single_value, &first, count);
    try appendChannelSeeds(buf, state, space_id, scope, selection_value, single_value, &first, count);
}

fn appendSpaceSeed(
    buf: *std.array_list.Managed(u8),
    space: ?state_mod.Space,
    space_id: []const u8,
    first: *bool,
    count: *usize,
) !void {
    if (!first.*) try buf.append(',');
    first.* = false;
    try buf.appendSlice("{\"kind\":\"space\",\"id\":\"");
    try appendEscaped(buf, if (space) |value| value.id else space_id);
    try buf.appendSlice("\",\"name\":\"");
    try appendEscaped(buf, if (space) |value| value.name else space_id);
    try buf.appendSlice("\",\"space_kind\":\"");
    try appendEscaped(buf, if (space) |value| value.kind else "workspace");
    try buf.appendSlice("\",\"stage\":\"");
    try appendEscaped(buf, if (space) |value| value.stage else "active");
    try buf.appendSlice("\"}");
    count.* += 1;
}

fn appendOrderSeeds(
    buf: *std.array_list.Managed(u8),
    paths: paths_mod.Paths,
    space_id: []const u8,
    scope: ExportScope,
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
    first: *bool,
    count: *usize,
) !void {
    const orders = try orders_mod.list(buf.allocator, paths, space_id);
    defer {
        for (orders) |order| order.deinit(buf.allocator);
        buf.allocator.free(orders);
    }
    for (orders) |order| {
        if (!includeOrder(scope, selection_value, single_value, order.id)) continue;
        if (!first.*) try buf.append(',');
        first.* = false;
        try buf.appendSlice("{\"kind\":\"order\",\"id\":\"");
        try appendEscaped(buf, order.id);
        try buf.appendSlice("\",\"title\":\"");
        try appendEscaped(buf, order.title);
        try buf.appendSlice("\",\"summary\":\"");
        try appendEscaped(buf, order.summary);
        try buf.appendSlice("\",\"order_kind\":\"");
        try appendEscaped(buf, order.kind);
        try buf.appendSlice("\",\"status\":\"");
        try appendEscaped(buf, order.status);
        try buf.appendSlice("\",\"schedule\":\"");
        try appendEscaped(buf, order.schedule);
        try buf.appendSlice("\",\"content\":\"");
        try appendEscaped(buf, order.content);
        try buf.appendSlice("\"}");
        count.* += 1;
    }
}

fn appendInstanceSeeds(
    buf: *std.array_list.Managed(u8),
    state: *state_mod.State,
    space_id: []const u8,
    scope: ExportScope,
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
    first: *bool,
    count: *usize,
) !void {
    var comp_it = state.instances.iterator();
    while (comp_it.next()) |component_entry| {
        const component = component_entry.key_ptr.*;
        var inst_it = component_entry.value_ptr.*.iterator();
        while (inst_it.next()) |inst_entry| {
            const name = inst_entry.key_ptr.*;
            const instance = inst_entry.value_ptr.*;
            if (!state.spaceMatches(instance.space_id, space_id)) continue;
            if (!includeInstance(scope, selection_value, single_value, component, name)) continue;
            if (!first.*) try buf.append(',');
            first.* = false;
            try buf.appendSlice("{\"kind\":\"instance\",\"component\":\"");
            try appendEscaped(buf, component);
            try buf.appendSlice("\",\"name\":\"");
            try appendEscaped(buf, name);
            try buf.appendSlice("\",\"version\":\"");
            try appendEscaped(buf, instance.version);
            try buf.appendSlice("\",\"launch_mode\":\"");
            try appendEscaped(buf, instance.launch_mode);
            try buf.appendSlice("\",\"auto_start\":");
            try buf.appendSlice(if (instance.auto_start) "true" else "false");
            if (instance.storage_mode.len > 0) {
                try buf.appendSlice(",\"storage_mode\":\"");
                try appendEscaped(buf, instance.storage_mode);
                try buf.appendSlice("\"");
            }
            try buf.appendSlice("}");
            count.* += 1;
        }
    }
}

fn appendProviderSeeds(
    buf: *std.array_list.Managed(u8),
    state: *state_mod.State,
    space_id: []const u8,
    scope: ExportScope,
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
    first: *bool,
    count: *usize,
) !void {
    for (state.savedProviders()) |provider| {
        if (!state.spaceMatches(provider.space_id, space_id)) continue;
        if (!includeProvider(scope, selection_value, single_value, provider)) continue;
        const ref = try providerSecretRef(buf.allocator, provider);
        defer buf.allocator.free(ref);
        if (!first.*) try buf.append(',');
        first.* = false;
        try buf.appendSlice("{\"kind\":\"provider\",\"id\":");
        try appendFmt(buf, "{d}", .{provider.id});
        try buf.appendSlice(",\"name\":\"");
        try appendEscaped(buf, provider.name);
        try buf.appendSlice("\",\"provider\":\"");
        try appendEscaped(buf, provider.provider);
        try buf.appendSlice("\",\"model\":\"");
        try appendEscaped(buf, provider.model);
        try buf.appendSlice("\",\"base_url\":\"");
        try appendEscaped(buf, provider.base_url);
        try buf.appendSlice("\",\"secret_ref\":\"");
        try appendEscaped(buf, ref);
        try buf.appendSlice("\"}");
        count.* += 1;
    }
}

fn appendChannelSeeds(
    buf: *std.array_list.Managed(u8),
    state: *state_mod.State,
    space_id: []const u8,
    scope: ExportScope,
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
    first: *bool,
    count: *usize,
) !void {
    for (state.savedChannels()) |channel| {
        if (!state.spaceMatches(channel.space_id, space_id)) continue;
        if (!includeChannel(scope, selection_value, single_value, channel)) continue;
        if (!first.*) try buf.append(',');
        first.* = false;
        try buf.appendSlice("{\"kind\":\"channel\",\"id\":");
        try appendFmt(buf, "{d}", .{channel.id});
        try buf.appendSlice(",\"name\":\"");
        try appendEscaped(buf, channel.name);
        try buf.appendSlice("\",\"channel_type\":\"");
        try appendEscaped(buf, channel.channel_type);
        try buf.appendSlice("\",\"account\":\"");
        try appendEscaped(buf, channel.account);
        try buf.appendSlice("\",\"config\":");
        try appendSanitizedConfig(buf, channel);
        try buf.appendSlice("}");
        count.* += 1;
    }
}

fn appendSelectedPackages(
    buf: *std.array_list.Managed(u8),
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
    scope: ExportScope,
    count: *usize,
) !void {
    var first = true;
    if (scope == .selection) {
        if (selection_value) |selection| {
            if (selection == .object) {
                if (selection.object.get("packages")) |packages| {
                    try appendStringItems(buf, packages, &first, count);
                }
            }
        }
    } else if (scope == .single) {
        if (singleMatchesKind(single_value, "package")) {
            if (singleId(single_value)) |id| {
                if (!first) try buf.append(',');
                first = false;
                try buf.append('"');
                try appendEscaped(buf, id);
                try buf.append('"');
                count.* += 1;
            }
        }
    }
}

fn appendStringItems(buf: *std.array_list.Managed(u8), value: std.json.Value, first: *bool, count: *usize) !void {
    if (value != .array) return;
    for (value.array.items) |item| {
        const string = valueAsString(item) orelse continue;
        if (!first.*) try buf.append(',');
        first.* = false;
        try buf.append('"');
        try appendEscaped(buf, string);
        try buf.append('"');
        count.* += 1;
    }
}

fn appendSanitizedConfig(buf: *std.array_list.Managed(u8), channel: state_mod.SavedChannel) !void {
    const trimmed = std.mem.trim(u8, channel.config, " \t\r\n");
    if (trimmed.len == 0) {
        try buf.appendSlice("{}");
        return;
    }
    var parsed = std.json.parseFromSlice(std.json.Value, buf.allocator, trimmed, .{
        .allocate = .alloc_always,
    }) catch {
        try buf.appendSlice("{\"config_ref\":\"channels.");
        try appendEscaped(buf, channel.channel_type);
        try buf.appendSlice(".");
        try appendFmt(buf, "{d}", .{channel.id});
        try buf.appendSlice(".config\"}");
        return;
    };
    defer parsed.deinit();
    const prefix = try std.fmt.allocPrint(buf.allocator, "channels.{s}.{d}.config", .{ channel.channel_type, channel.id });
    defer buf.allocator.free(prefix);
    try appendSanitizedJsonValue(buf, parsed.value, prefix);
}

fn appendSanitizedJsonValue(buf: *std.array_list.Managed(u8), value: std.json.Value, ref_prefix: []const u8) !void {
    switch (value) {
        .object => |object| {
            try buf.append('{');
            var first = true;
            var it = object.iterator();
            while (it.next()) |entry| {
                if (!first) try buf.append(',');
                first = false;
                try buf.append('"');
                try appendEscaped(buf, entry.key_ptr.*);
                try buf.appendSlice("\":");
                if (isSecretishKey(entry.key_ptr.*)) {
                    try buf.appendSlice("{\"secret_ref\":\"");
                    try appendEscaped(buf, ref_prefix);
                    try buf.append('.');
                    try appendEscaped(buf, entry.key_ptr.*);
                    try buf.appendSlice("\"}");
                } else {
                    const child_prefix = try std.fmt.allocPrint(buf.allocator, "{s}.{s}", .{ ref_prefix, entry.key_ptr.* });
                    defer buf.allocator.free(child_prefix);
                    try appendSanitizedJsonValue(buf, entry.value_ptr.*, child_prefix);
                }
            }
            try buf.append('}');
        },
        .array => |array| {
            try buf.append('[');
            for (array.items, 0..) |item, idx| {
                if (idx > 0) try buf.append(',');
                try appendSanitizedJsonValue(buf, item, ref_prefix);
            }
            try buf.append(']');
        },
        else => {
            const raw = try std.json.Stringify.valueAlloc(buf.allocator, value, .{});
            defer buf.allocator.free(raw);
            try buf.appendSlice(raw);
        },
    }
}

fn appendPackageExportedEvent(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    space_id: []const u8,
    package_id: []const u8,
    scale: Scale,
    manifest_path: []const u8,
    download_url: []const u8,
    now_ms: i64,
) !void {
    var payload = std.array_list.Managed(u8).init(allocator);
    defer payload.deinit();
    try payload.appendSlice("{\"scale\":\"");
    try payload.appendSlice(scaleString(scale));
    try payload.appendSlice("\",\"file\":\"");
    try appendEscaped(&payload, manifest_path);
    try payload.appendSlice("\",\"download_url\":\"");
    try appendEscaped(&payload, download_url);
    try payload.appendSlice("\"}");

    _ = try state.addEvent(.{
        .space_id = space_id,
        .event_type = "package.exported",
        .source = "nullhub",
        .subject_type = "package",
        .subject_id = package_id,
        .title = "Package exported",
        .summary = "Space package manifest exported to the local library.",
        .severity = "info",
        .payload_json = payload.items,
        .created_at_ms = now_ms,
    });
}

fn renderExportResponse(
    allocator: std.mem.Allocator,
    package_id: []const u8,
    manifest_path: []const u8,
    download_url: []const u8,
    manifest: []const u8,
) ![]const u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    try buf.appendSlice("{\"status\":\"exported\",\"package_id\":\"");
    try appendEscaped(&buf, package_id);
    try buf.appendSlice("\",\"file\":\"");
    try appendEscaped(&buf, manifest_path);
    try buf.appendSlice("\",\"download_url\":\"");
    try appendEscaped(&buf, download_url);
    try buf.appendSlice("\",\"package\":");
    try buf.appendSlice(manifest);
    try buf.appendSlice("}");
    return buf.toOwnedSlice();
}

fn buildDownloadUrl(allocator: std.mem.Allocator, space_id: []const u8, package_id: []const u8) ![]u8 {
    return std.fmt.allocPrint(allocator, "/api/market/library/{s}.json?space={s}", .{ package_id, space_id });
}

fn providerSecretRef(allocator: std.mem.Allocator, provider: state_mod.SavedProvider) ![]u8 {
    return std.fmt.allocPrint(allocator, "providers.{s}.{d}.api_key", .{ provider.provider, provider.id });
}

fn includeOrder(scope: ExportScope, selection_value: ?std.json.Value, single_value: ?std.json.Value, id: []const u8) bool {
    return switch (scope) {
        .space => true,
        .selection => selectionContains(selection_value, "orders", id) or selectionContains(selection_value, "order_ids", id),
        .single => singleMatches(single_value, "order", id),
    };
}

fn includeInstance(
    scope: ExportScope,
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
    component: []const u8,
    name: []const u8,
) bool {
    return switch (scope) {
        .space => true,
        .selection => selectionContainsInstance(selection_value, component, name),
        .single => singleMatchesInstance(single_value, component, name),
    };
}

fn includeProvider(
    scope: ExportScope,
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
    provider: state_mod.SavedProvider,
) bool {
    return switch (scope) {
        .space => true,
        .selection => selectionContainsProvider(selection_value, provider),
        .single => singleMatchesProvider(single_value, provider),
    };
}

fn includeChannel(
    scope: ExportScope,
    selection_value: ?std.json.Value,
    single_value: ?std.json.Value,
    channel: state_mod.SavedChannel,
) bool {
    return switch (scope) {
        .space => true,
        .selection => selectionContainsChannel(selection_value, channel),
        .single => singleMatchesChannel(single_value, channel),
    };
}

fn selectionContains(selection_value: ?std.json.Value, field: []const u8, id: []const u8) bool {
    const selection = selection_value orelse return false;
    if (selection != .object) return false;
    const items = selection.object.get(field) orelse return false;
    if (items != .array) return false;
    for (items.array.items) |item| {
        if (itemMatchesId(item, id)) return true;
    }
    return false;
}

fn selectionContainsInstance(selection_value: ?std.json.Value, component: []const u8, name: []const u8) bool {
    const selection = selection_value orelse return false;
    if (selection != .object) return false;
    const items = selection.object.get("instances") orelse return false;
    if (items != .array) return false;
    for (items.array.items) |item| {
        if (valueAsString(item)) |raw| {
            if (std.mem.eql(u8, raw, name)) return true;
            if (matchesInstancePath(raw, component, name)) return true;
        } else if (item == .object) {
            const item_component = stringField(item.object, "component") orelse component;
            const item_name = stringField(item.object, "name") orelse stringField(item.object, "id") orelse "";
            if (std.mem.eql(u8, item_component, component) and std.mem.eql(u8, item_name, name)) return true;
        }
    }
    return false;
}

fn selectionContainsProvider(selection_value: ?std.json.Value, provider: state_mod.SavedProvider) bool {
    return selectionContainsNumericOrName(selection_value, "providers", provider.id, provider.name, provider.provider) or
        selectionContainsNumericOrName(selection_value, "provider_ids", provider.id, provider.name, provider.provider);
}

fn selectionContainsChannel(selection_value: ?std.json.Value, channel: state_mod.SavedChannel) bool {
    return selectionContainsNumericOrName(selection_value, "channels", channel.id, channel.name, channel.channel_type) or
        selectionContainsNumericOrName(selection_value, "channel_ids", channel.id, channel.name, channel.channel_type);
}

fn selectionContainsNumericOrName(
    selection_value: ?std.json.Value,
    field: []const u8,
    id: u32,
    name: []const u8,
    alt: []const u8,
) bool {
    const selection = selection_value orelse return false;
    if (selection != .object) return false;
    const items = selection.object.get(field) orelse return false;
    if (items != .array) return false;
    for (items.array.items) |item| {
        if (numericItemMatches(item, id)) return true;
        if (valueAsString(item)) |string| {
            if (std.mem.eql(u8, string, name) or std.mem.eql(u8, string, alt)) return true;
            if (std.fmt.parseInt(u32, string, 10) catch null) |parsed| {
                if (parsed == id) return true;
            }
        } else if (item == .object) {
            if (stringField(item.object, "id")) |raw| {
                if (std.fmt.parseInt(u32, raw, 10) catch null) |parsed| {
                    if (parsed == id) return true;
                }
                if (std.mem.eql(u8, raw, name) or std.mem.eql(u8, raw, alt)) return true;
            }
            if (stringField(item.object, "name")) |raw| {
                if (std.mem.eql(u8, raw, name) or std.mem.eql(u8, raw, alt)) return true;
            }
        }
    }
    return false;
}

fn singleMatches(single_value: ?std.json.Value, kind: []const u8, id: []const u8) bool {
    if (!singleMatchesKind(single_value, kind)) return false;
    const actual = singleId(single_value) orelse return false;
    return std.mem.eql(u8, actual, id);
}

fn singleMatchesKind(single_value: ?std.json.Value, kind: []const u8) bool {
    const value = single_value orelse return false;
    if (value != .object) return false;
    const actual = stringField(value.object, "kind") orelse stringField(value.object, "type") orelse return false;
    return std.mem.eql(u8, actual, kind);
}

fn singleId(single_value: ?std.json.Value) ?[]const u8 {
    const value = single_value orelse return null;
    if (value != .object) return null;
    return stringField(value.object, "id") orelse stringField(value.object, "name") orelse stringField(value.object, "package");
}

fn singleMatchesInstance(single_value: ?std.json.Value, component: []const u8, name: []const u8) bool {
    if (!singleMatchesKind(single_value, "instance")) return false;
    const value = single_value orelse return false;
    const wanted_component = if (value == .object) stringField(value.object, "component") orelse component else component;
    const wanted_name = singleId(single_value) orelse return false;
    if (!std.mem.eql(u8, wanted_component, component)) return false;
    if (std.mem.eql(u8, wanted_name, name)) return true;
    return matchesInstancePath(wanted_name, component, name);
}

fn singleMatchesProvider(single_value: ?std.json.Value, provider: state_mod.SavedProvider) bool {
    if (!singleMatchesKind(single_value, "provider")) return false;
    const value = single_value orelse return false;
    if (value != .object) return false;
    if (singleId(single_value)) |id| {
        if (std.mem.eql(u8, id, provider.name) or std.mem.eql(u8, id, provider.provider)) return true;
        if (std.fmt.parseInt(u32, id, 10) catch null) |parsed| return parsed == provider.id;
    }
    return false;
}

fn singleMatchesChannel(single_value: ?std.json.Value, channel: state_mod.SavedChannel) bool {
    if (!singleMatchesKind(single_value, "channel")) return false;
    const value = single_value orelse return false;
    if (value != .object) return false;
    if (singleId(single_value)) |id| {
        if (std.mem.eql(u8, id, channel.name) or std.mem.eql(u8, id, channel.channel_type)) return true;
        if (std.fmt.parseInt(u32, id, 10) catch null) |parsed| return parsed == channel.id;
    }
    return false;
}

fn itemMatchesId(item: std.json.Value, id: []const u8) bool {
    if (valueAsString(item)) |string| return std.mem.eql(u8, string, id);
    if (item == .object) {
        if (stringField(item.object, "id")) |string| return std.mem.eql(u8, string, id);
    }
    return false;
}

fn numericItemMatches(item: std.json.Value, id: u32) bool {
    return switch (item) {
        .integer => |value| value >= 0 and value <= std.math.maxInt(u32) and @as(u32, @intCast(value)) == id,
        .number_string => |value| (std.fmt.parseInt(u32, value, 10) catch return false) == id,
        else => false,
    };
}

fn matchesInstancePath(raw: []const u8, component: []const u8, name: []const u8) bool {
    const sep = std.mem.indexOfScalar(u8, raw, '/') orelse return false;
    return std.mem.eql(u8, raw[0..sep], component) and std.mem.eql(u8, raw[sep + 1 ..], name);
}

fn valueAsString(value: std.json.Value) ?[]const u8 {
    return switch (value) {
        .string => |raw| raw,
        .number_string => |raw| raw,
        else => null,
    };
}

fn stringField(object: std.json.ObjectMap, key: []const u8) ?[]const u8 {
    const value = object.get(key) orelse return null;
    return switch (value) {
        .string => |raw| if (std.mem.trim(u8, raw, " \t\r\n").len == 0) null else raw,
        .number_string => |raw| if (std.mem.trim(u8, raw, " \t\r\n").len == 0) null else raw,
        else => null,
    };
}

fn isSafePackageId(id: []const u8) bool {
    if (id.len == 0 or id.len > 128 or id[0] == '.') return false;
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

fn isSecretishKey(key: []const u8) bool {
    return channels_api.isSecretKey(key) or
        containsAsciiIgnoreCase(key, "secret") or
        containsAsciiIgnoreCase(key, "token") or
        containsAsciiIgnoreCase(key, "api_key") or
        containsAsciiIgnoreCase(key, "apikey") or
        containsAsciiIgnoreCase(key, "password") or
        containsAsciiIgnoreCase(key, "private_key");
}

fn containsAsciiIgnoreCase(haystack: []const u8, needle: []const u8) bool {
    if (needle.len == 0) return true;
    if (haystack.len < needle.len) return false;
    var idx: usize = 0;
    while (idx + needle.len <= haystack.len) : (idx += 1) {
        if (std.ascii.eqlIgnoreCase(haystack[idx .. idx + needle.len], needle)) return true;
    }
    return false;
}

fn scaleString(scale: Scale) []const u8 {
    return switch (scale) {
        .component => "component",
        .kit => "kit",
        .blueprint => "blueprint",
    };
}

fn defaultExportName(scope: ExportScope, scale: Scale) []const u8 {
    _ = scale;
    return switch (scope) {
        .space => "Exported Space Blueprint",
        .selection => "Exported Selection Kit",
        .single => "Exported Component",
    };
}

fn defaultExportSummary(scope: ExportScope) []const u8 {
    return switch (scope) {
        .space => "Whole-space export generated from local tenant data.",
        .selection => "Selected package export generated from local tenant data.",
        .single => "Single component export generated from local tenant data.",
    };
}

fn appendFmt(buf: *std.array_list.Managed(u8), comptime fmt: []const u8, args: anytype) !void {
    const text = try std.fmt.allocPrint(buf.allocator, fmt, args);
    defer buf.allocator.free(text);
    try buf.appendSlice(text);
}

fn validateManifestValue(value: std.json.Value) ValidationError!void {
    const root = switch (value) {
        .object => |object| object,
        else => return error.ManifestRootNotObject,
    };

    try requireString(root, "id", error.MissingId, error.InvalidId);
    try requireString(root, "name", error.MissingName, error.InvalidName);
    try requireString(root, "version", error.MissingVersion, error.InvalidVersion);

    const scale_value = root.get("scale") orelse return error.MissingScale;
    const scale = switch (scale_value) {
        .string => |raw| raw,
        else => return error.InvalidScale,
    };
    if (Scale.fromString(scale) == null) return error.InvalidScale;

    try requireArray(root, "requires", error.MissingRequires, error.InvalidRequires);
    try requireArray(root, "contributes", error.MissingContributes, error.InvalidContributes);
    try requireObject(root, "config", error.MissingConfig, error.InvalidConfig);
    try requireArray(root, "seeds", error.MissingSeeds, error.InvalidSeeds);
    try requireArray(root, "extends", error.MissingExtends, error.InvalidExtends);
    try requireObject(root, "charter", error.MissingCharter, error.InvalidCharter);

    if (containsForbiddenSecretValue(root)) return error.SecretValueNotAllowed;
    try validateConfigSecrets(root.get("config").?.object);
    try validateSecretRefDeclarations(value);
}

fn requireString(
    root: std.json.ObjectMap,
    key: []const u8,
    missing_error: ValidationError,
    invalid_error: ValidationError,
) ValidationError!void {
    const value = root.get(key) orelse return missing_error;
    switch (value) {
        .string => |raw| if (std.mem.trim(u8, raw, " \t\r\n").len == 0) return invalid_error,
        else => return invalid_error,
    }
}

fn requireArray(
    root: std.json.ObjectMap,
    key: []const u8,
    missing_error: ValidationError,
    invalid_error: ValidationError,
) ValidationError!void {
    const value = root.get(key) orelse return missing_error;
    switch (value) {
        .array => {},
        else => return invalid_error,
    }
}

fn requireObject(
    root: std.json.ObjectMap,
    key: []const u8,
    missing_error: ValidationError,
    invalid_error: ValidationError,
) ValidationError!void {
    const value = root.get(key) orelse return missing_error;
    switch (value) {
        .object => {},
        else => return invalid_error,
    }
}

fn containsForbiddenSecretValue(object: std.json.ObjectMap) bool {
    var it = object.iterator();
    while (it.next()) |entry| {
        if (isForbiddenSecretKey(entry.key_ptr.*)) return true;
        if (valueContainsForbiddenSecretValue(entry.value_ptr.*)) return true;
    }
    return false;
}

fn valueContainsForbiddenSecretValue(value: std.json.Value) bool {
    return switch (value) {
        .object => |object| containsForbiddenSecretValue(object),
        .array => |array| blk: {
            for (array.items) |item| {
                if (valueContainsForbiddenSecretValue(item)) break :blk true;
            }
            break :blk false;
        },
        else => false,
    };
}

fn isForbiddenSecretKey(key: []const u8) bool {
    return std.mem.eql(u8, key, "secret_value") or
        std.mem.eql(u8, key, "encrypted_secret_value") or
        std.mem.eql(u8, key, "encrypted_value");
}

fn validateConfigSecrets(config: std.json.ObjectMap) ValidationError!void {
    const secrets_value = config.get("secrets") orelse return;
    const secrets = switch (secrets_value) {
        .array => |array| array,
        else => return error.InvalidConfig,
    };

    for (secrets.items) |item| {
        const secret = switch (item) {
            .object => |object| object,
            else => return error.InvalidConfig,
        };
        try validateSecretRefObject(secret);
    }
}

fn validateSecretRefDeclarations(value: std.json.Value) ValidationError!void {
    switch (value) {
        .object => |object| {
            if (objectDeclaresSecretRef(object)) {
                try validateSecretRefObject(object);
            }
            var it = object.iterator();
            while (it.next()) |entry| {
                try validateSecretRefDeclarations(entry.value_ptr.*);
            }
        },
        .array => |array| {
            for (array.items) |item| {
                try validateSecretRefDeclarations(item);
            }
        },
        else => {},
    }
}

fn objectDeclaresSecretRef(object: std.json.ObjectMap) bool {
    if (object.get("secret_ref") != null) return true;
    const kind_value = object.get("kind") orelse return false;
    return switch (kind_value) {
        .string => |kind| std.mem.eql(u8, kind, "secret_ref"),
        else => false,
    };
}

fn validateSecretRefObject(object: std.json.ObjectMap) ValidationError!void {
    if (object.get("value") != null) return error.SecretValueNotAllowed;
    const ref_value = object.get("secret_ref") orelse return error.MissingSecretRef;
    switch (ref_value) {
        .string => |raw| if (std.mem.trim(u8, raw, " \t\r\n").len == 0) return error.InvalidSecretRef,
        else => return error.InvalidSecretRef,
    }
}

fn resolveBuiltinCatalogDir(allocator: std.mem.Allocator) ![]u8 {
    if (std_compat.process.getEnvVarOwned(allocator, "NULLHUB_BUILTIN_CATALOG_DIR")) |env_path| {
        errdefer allocator.free(env_path);
        if (!catalogDirExists(env_path)) return error.FileNotFound;
        return env_path;
    } else |err| switch (err) {
        error.EnvironmentVariableNotFound => {},
        else => return err,
    }

    if (std_compat.fs.selfExePathAlloc(allocator)) |exe_path| {
        defer allocator.free(exe_path);
        if (std.fs.path.dirname(exe_path)) |exe_dir| {
            const candidate_parts = [_][]const []const u8{
                &.{ exe_dir, "market", "catalog" },
                &.{ exe_dir, "..", "market", "catalog" },
                &.{ exe_dir, "..", "share", "nullhub", "market", "catalog" },
                &.{ exe_dir, "..", "..", "market", "catalog" },
            };
            for (candidate_parts) |parts| {
                if (resolveExistingCatalogDir(allocator, parts)) |candidate| {
                    return candidate;
                } else |_| {}
            }
        }
    } else |_| {}

    return try resolveExistingCatalogDir(allocator, &.{ build_options.source_root, "market", "catalog" });
}

fn resolveExistingCatalogDir(allocator: std.mem.Allocator, parts: []const []const u8) ![]u8 {
    const candidate = try std.fs.path.resolve(allocator, parts);
    errdefer allocator.free(candidate);
    if (!catalogDirExists(candidate)) return error.FileNotFound;
    return candidate;
}

fn catalogDirExists(path: []const u8) bool {
    var dir = openDirAny(path, .{ .iterate = true }) catch return false;
    dir.close();
    return true;
}

fn renderManifestDirectory(allocator: std.mem.Allocator, dir_path: []const u8, missing_ok: bool) ![]const u8 {
    var dir = openDirAny(dir_path, .{ .iterate = true }) catch |err| switch (err) {
        error.FileNotFound => {
            if (missing_ok) return allocator.dupe(u8, "{\"packages\":[]}");
            return err;
        },
        else => return err,
    };
    defer dir.close();

    var names = std.array_list.Managed([]u8).init(allocator);
    defer {
        for (names.items) |name| allocator.free(name);
        names.deinit();
    }

    var it = dir.iterate();
    while (try it.next()) |entry| {
        if (entry.kind != .file) continue;
        if (!std.mem.endsWith(u8, entry.name, ".json")) continue;
        try names.append(try allocator.dupe(u8, entry.name));
    }

    std.mem.sort([]u8, names.items, {}, struct {
        fn lessThan(_: void, left: []u8, right: []u8) bool {
            return std.mem.lessThan(u8, left, right);
        }
    }.lessThan);

    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    try buf.appendSlice("{\"packages\":[");
    for (names.items, 0..) |name, idx| {
        const raw = try dir.readFileAlloc(allocator, name, max_manifest_bytes);
        defer allocator.free(raw);
        const bytes = std.mem.trim(u8, raw, " \t\r\n");
        try validateManifestJson(allocator, bytes);
        if (idx > 0) try buf.append(',');
        try buf.appendSlice(bytes);
    }
    try buf.appendSlice("]}");
    return buf.toOwnedSlice();
}

fn openDirAny(path: []const u8, options: std_compat.fs.Dir.OpenDirOptions) !std_compat.fs.Dir {
    if (std.fs.path.isAbsolute(path)) return std_compat.fs.openDirAbsolute(path, options);
    return std_compat.fs.cwd().openDir(path, options);
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

fn manifestForScale(scale: []const u8) []const u8 {
    if (std.mem.eql(u8, scale, "component")) {
        return "{\"id\":\"example.component\",\"name\":\"Example component\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}";
    }
    if (std.mem.eql(u8, scale, "kit")) {
        return "{\"id\":\"example.kit\",\"name\":\"Example kit\",\"version\":\"1.0.0\",\"scale\":\"kit\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}";
    }
    if (std.mem.eql(u8, scale, "blueprint")) {
        return "{\"id\":\"example.blueprint\",\"name\":\"Example blueprint\",\"version\":\"1.0.0\",\"scale\":\"blueprint\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}";
    }
    unreachable;
}

fn manifestWithoutField(field: []const u8) []const u8 {
    if (std.mem.eql(u8, field, "id")) {
        return "{\"name\":\"Missing id\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}";
    }
    if (std.mem.eql(u8, field, "name")) {
        return "{\"id\":\"example.missing-name\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}";
    }
    if (std.mem.eql(u8, field, "version")) {
        return "{\"id\":\"example.missing-version\",\"name\":\"Missing version\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}";
    }
    if (std.mem.eql(u8, field, "scale")) {
        return "{\"id\":\"example.missing-scale\",\"name\":\"Missing scale\",\"version\":\"1.0.0\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}";
    }
    if (std.mem.eql(u8, field, "requires")) {
        return "{\"id\":\"example.missing-requires\",\"name\":\"Missing requires\",\"version\":\"1.0.0\",\"scale\":\"component\",\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}";
    }
    if (std.mem.eql(u8, field, "contributes")) {
        return "{\"id\":\"example.missing-contributes\",\"name\":\"Missing contributes\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}";
    }
    if (std.mem.eql(u8, field, "config")) {
        return "{\"id\":\"example.missing-config\",\"name\":\"Missing config\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"seeds\":[],\"extends\":[],\"charter\":{}}";
    }
    if (std.mem.eql(u8, field, "seeds")) {
        return "{\"id\":\"example.missing-seeds\",\"name\":\"Missing seeds\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"extends\":[],\"charter\":{}}";
    }
    if (std.mem.eql(u8, field, "extends")) {
        return "{\"id\":\"example.missing-extends\",\"name\":\"Missing extends\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"charter\":{}}";
    }
    if (std.mem.eql(u8, field, "charter")) {
        return "{\"id\":\"example.missing-charter\",\"name\":\"Missing charter\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[]}";
    }
    unreachable;
}

fn writeManifest(dir: std_compat.fs.Dir, name: []const u8, bytes: []const u8) !void {
    var file = try dir.createFile(name, .{ .truncate = true });
    defer file.close();
    try file.writeAll(bytes);
}

test "market manifest validates all package scales" {
    const allocator = std.testing.allocator;
    try validateManifestJson(allocator, manifestForScale("component"));
    try validateManifestJson(allocator, manifestForScale("kit"));
    try validateManifestJson(allocator, manifestForScale("blueprint"));
}

test "market manifest rejects invalid scale" {
    try std.testing.expectError(
        error.InvalidScale,
        validateManifestJson(std.testing.allocator, "{\"id\":\"example.invalid-scale\",\"name\":\"Invalid scale\",\"version\":\"1.0.0\",\"scale\":\"workflow\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}"),
    );
}

test "market manifest rejects missing required fields" {
    const allocator = std.testing.allocator;
    try std.testing.expectError(error.MissingId, validateManifestJson(allocator, manifestWithoutField("id")));
    try std.testing.expectError(error.MissingName, validateManifestJson(allocator, manifestWithoutField("name")));
    try std.testing.expectError(error.MissingVersion, validateManifestJson(allocator, manifestWithoutField("version")));
    try std.testing.expectError(error.MissingScale, validateManifestJson(allocator, manifestWithoutField("scale")));
    try std.testing.expectError(error.MissingRequires, validateManifestJson(allocator, manifestWithoutField("requires")));
    try std.testing.expectError(error.MissingContributes, validateManifestJson(allocator, manifestWithoutField("contributes")));
    try std.testing.expectError(error.MissingConfig, validateManifestJson(allocator, manifestWithoutField("config")));
    try std.testing.expectError(error.MissingSeeds, validateManifestJson(allocator, manifestWithoutField("seeds")));
    try std.testing.expectError(error.MissingExtends, validateManifestJson(allocator, manifestWithoutField("extends")));
    try std.testing.expectError(error.MissingCharter, validateManifestJson(allocator, manifestWithoutField("charter")));
}

test "market manifest rejects invalid required field shapes" {
    const allocator = std.testing.allocator;
    try std.testing.expectError(error.InvalidId, validateManifestJson(allocator, "{\"id\":1,\"name\":\"Invalid id\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}"));
    try std.testing.expectError(error.InvalidName, validateManifestJson(allocator, "{\"id\":\"example.invalid-name\",\"name\":\"\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}"));
    try std.testing.expectError(error.InvalidVersion, validateManifestJson(allocator, "{\"id\":\"example.invalid-version\",\"name\":\"Invalid version\",\"version\":1,\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}"));
    try std.testing.expectError(error.InvalidRequires, validateManifestJson(allocator, "{\"id\":\"example.invalid-requires\",\"name\":\"Invalid requires\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":{},\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}"));
    try std.testing.expectError(error.InvalidContributes, validateManifestJson(allocator, "{\"id\":\"example.invalid-contributes\",\"name\":\"Invalid contributes\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":{},\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}"));
    try std.testing.expectError(error.InvalidConfig, validateManifestJson(allocator, "{\"id\":\"example.invalid-config\",\"name\":\"Invalid config\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":[],\"seeds\":[],\"extends\":[],\"charter\":{}}"));
    try std.testing.expectError(error.InvalidSeeds, validateManifestJson(allocator, "{\"id\":\"example.invalid-seeds\",\"name\":\"Invalid seeds\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":{},\"extends\":[],\"charter\":{}}"));
    try std.testing.expectError(error.InvalidExtends, validateManifestJson(allocator, "{\"id\":\"example.invalid-extends\",\"name\":\"Invalid extends\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":{},\"charter\":{}}"));
    try std.testing.expectError(error.InvalidCharter, validateManifestJson(allocator, "{\"id\":\"example.invalid-charter\",\"name\":\"Invalid charter\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":[]}"));
}

test "market manifest rejects secret values" {
    try std.testing.expectError(
        error.SecretValueNotAllowed,
        validateManifestJson(std.testing.allocator, "{\"id\":\"example.secret-value\",\"name\":\"Secret value\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{\"secrets\":[{\"name\":\"api\",\"secret_value\":\"nope\"}]},\"seeds\":[],\"extends\":[],\"charter\":{}}"),
    );
}

test "market manifest requires secret refs for secret declarations" {
    const allocator = std.testing.allocator;
    try validateManifestJson(allocator, "{\"id\":\"example.secret-ref\",\"name\":\"Secret ref\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[{\"kind\":\"secret_ref\",\"name\":\"api\",\"secret_ref\":\"providers.default.api_key\"}],\"contributes\":[],\"config\":{\"secrets\":[{\"name\":\"api\",\"secret_ref\":\"providers.default.api_key\"}],\"plain\":{\"value\":\"non-secret config stays valid\"}},\"seeds\":[],\"extends\":[],\"charter\":{}}");
    try std.testing.expectError(error.MissingSecretRef, validateManifestJson(allocator, "{\"id\":\"example.missing-secret-ref\",\"name\":\"Missing secret ref\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[{\"kind\":\"secret_ref\",\"name\":\"api\"}],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}"));
    try std.testing.expectError(error.MissingSecretRef, validateManifestJson(allocator, "{\"id\":\"example.config-secret-ref\",\"name\":\"Config missing secret ref\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{\"secrets\":[{\"name\":\"api\"}]},\"seeds\":[],\"extends\":[],\"charter\":{}}"));
    try std.testing.expectError(error.SecretValueNotAllowed, validateManifestJson(allocator, "{\"id\":\"example.literal-secret\",\"name\":\"Literal secret\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[{\"kind\":\"secret_ref\",\"name\":\"api\",\"value\":\"literal\"}],\"contributes\":[],\"config\":{},\"seeds\":[],\"extends\":[],\"charter\":{}}"));
}

test "market catalog handler fails when builtin catalog directory is missing" {
    const resp = blk: {
        const body = renderManifestDirectory(std.testing.allocator, "/tmp/nullhub-definitely-missing-market-catalog", false) catch {
            break :blk helpers.serverError();
        };
        break :blk helpers.jsonOk(body);
    };
    try std.testing.expectEqualStrings("500 Internal Server Error", resp.status);
}

test "market catalog and installed handlers list package manifests" {
    const allocator = std.testing.allocator;
    const builtin_catalog_root = try resolveBuiltinCatalogDir(allocator);
    defer allocator.free(builtin_catalog_root);
    const builtin_catalog_json = try renderManifestDirectory(allocator, builtin_catalog_root, false);
    defer allocator.free(builtin_catalog_json);
    try std.testing.expect(std.mem.indexOf(u8, builtin_catalog_json, "\"scale\": \"component\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, builtin_catalog_json, "\"scale\": \"kit\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, builtin_catalog_json, "\"scale\": \"blueprint\"") != null);

    var catalog_tmp = std.testing.tmpDir(.{});
    defer catalog_tmp.cleanup();
    var catalog_dir = std_compat.fs.Dir.wrap(catalog_tmp.dir);
    try writeManifest(catalog_dir, "component.json", manifestForScale("component"));
    try writeManifest(catalog_dir, "kit.json", manifestForScale("kit"));

    const catalog_root = try catalog_dir.realpathAlloc(allocator, ".");
    defer allocator.free(catalog_root);
    const catalog_json = try renderManifestDirectory(allocator, catalog_root, false);
    defer allocator.free(catalog_json);
    try std.testing.expect(std.mem.indexOf(u8, catalog_json, "\"scale\":\"component\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, catalog_json, "\"scale\":\"kit\"") != null);

    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const library_dir = try fixture.paths.spacePackageLibraryDir(allocator, "ops");
    defer allocator.free(library_dir);
    try std_compat.fs.makePathAbsolute(library_dir);
    var library = try std_compat.fs.openDirAbsolute(library_dir, .{});
    defer library.close();
    try writeManifest(library, "blueprint.json", manifestForScale("blueprint"));

    const resp = handleInstalled(allocator, fixture.paths, "/api/market/installed?space=ops");
    defer allocator.free(resp.body);
    try std.testing.expectEqualStrings("200 OK", resp.status);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"scale\":\"blueprint\"") != null);
}

test "market export writes blueprint to library strips secrets and emits event" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    _ = try state.addSpace(.{ .id = "ops", .name = "Ops", .kind = "workspace", .stage = "active" });
    try state.addInstance("nullclaw", "ops-agent", .{ .version = "1.0.0", .space_id = "ops", .auto_start = true });
    try state.addSavedProvider(.{
        .provider = "openrouter",
        .api_key = "sk-secret-provider",
        .model = "openrouter/auto",
        .space_id = "ops",
    });
    try state.addSavedChannel(.{
        .channel_type = "telegram",
        .account = "@ops",
        .config = "{\"bot_token\":\"secret-channel-token\",\"encrypt_key\":\"secret-channel-encrypt-key\",\"chat_id\":\"123\"}",
        .space_id = "ops",
    });
    var order = try orders_mod.create(allocator, fixture.paths, "ops", .{
        .id = "daily-brief",
        .title = "Daily Brief",
        .kind = "schedule",
        .schedule = "0 9 * * 1-5",
        .content = "Prepare a daily operations brief.",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer order.deinit(allocator);

    const resp = handleExport(
        allocator,
        fixture.paths,
        &state,
        "/api/market/export?space=ops",
        "{\"id\":\"export.ops.blueprint\",\"name\":\"Ops Blueprint\",\"scope\":\"space\"}",
        2000,
    );
    defer allocator.free(resp.body);
    try std.testing.expectEqualStrings("201 Created", resp.status);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"scale\":\"blueprint\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "Daily Brief") != null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "sk-secret-provider") == null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "secret-channel-token") == null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "secret-channel-encrypt-key") == null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "providers.openrouter.1.api_key") != null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "channels.telegram.1.config.bot_token") != null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "channels.telegram.1.config.encrypt_key") != null);

    const manifest_path = try fixture.paths.spacePackageLibraryManifest(allocator, "ops", "export.ops.blueprint");
    defer allocator.free(manifest_path);
    const manifest = try std_compat.fs.readFileAbsolute(allocator, manifest_path, max_manifest_bytes);
    defer allocator.free(manifest);
    try validateManifestJson(allocator, manifest);
    try std.testing.expect(std.mem.indexOf(u8, manifest, "\"kind\":\"provider\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, manifest, "\"secret_ref\":\"providers.openrouter.1.api_key\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, manifest, "sk-secret-provider") == null);
    try std.testing.expect(std.mem.indexOf(u8, manifest, "secret-channel-encrypt-key") == null);
    try std.testing.expect(std.mem.indexOf(u8, manifest, "\"secret_ref\":\"channels.telegram.1.config.encrypt_key\"") != null);

    const events = state.eventsList();
    try std.testing.expectEqual(@as(usize, 1), events.len);
    try std.testing.expectEqualStrings("package.exported", events[0].event_type);
    try std.testing.expectEqualStrings("package", events[0].subject_type);
    try std.testing.expectEqualStrings("export.ops.blueprint", events[0].subject_id);

    const download = handleLibraryDownload(allocator, fixture.paths, "/api/market/library/export.ops.blueprint.json?space=ops", "export.ops.blueprint");
    defer allocator.free(download.body);
    try std.testing.expectEqualStrings("200 OK", download.status);
    try std.testing.expect(std.mem.indexOf(u8, download.body, "\"id\":\"export.ops.blueprint\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, download.body, "secret-channel-encrypt-key") == null);
    try std.testing.expect(std.mem.indexOf(u8, download.body, "\"secret_ref\":\"channels.telegram.1.config.encrypt_key\"") != null);
}

test "market export supports selection kit and single component" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    var selected = try orders_mod.create(allocator, fixture.paths, "ops", .{
        .id = "selected-order",
        .title = "Selected Order",
        .kind = "policy",
        .content = "Export this policy.",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer selected.deinit(allocator);
    var skipped = try orders_mod.create(allocator, fixture.paths, "ops", .{
        .id = "skipped-order",
        .title = "Skipped Order",
        .kind = "policy",
        .content = "Do not export this policy.",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer skipped.deinit(allocator);
    try state.addInstance("nullclaw", "kit-agent", .{ .version = "1.0.0", .space_id = "ops" });

    {
        const resp = handleExport(
            allocator,
            fixture.paths,
            &state,
            "/api/market/export?space=ops",
            "{\"id\":\"export.ops.kit\",\"scope\":\"selection\",\"selection\":{\"orders\":[\"selected-order\"],\"instances\":[\"nullclaw/kit-agent\"]}}",
            3000,
        );
        defer allocator.free(resp.body);
        try std.testing.expectEqualStrings("201 Created", resp.status);
        try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"scale\":\"kit\"") != null);
        try std.testing.expect(std.mem.indexOf(u8, resp.body, "Selected Order") != null);
        try std.testing.expect(std.mem.indexOf(u8, resp.body, "Skipped Order") == null);
        try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"kind\":\"instance\"") != null);
    }

    {
        const resp = handleExport(
            allocator,
            fixture.paths,
            &state,
            "/api/market/export?space=ops",
            "{\"id\":\"export.ops.component\",\"scope\":\"single\",\"single\":{\"kind\":\"order\",\"id\":\"selected-order\"}}",
            4000,
        );
        defer allocator.free(resp.body);
        try std.testing.expectEqualStrings("201 Created", resp.status);
        try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"scale\":\"component\"") != null);
        try std.testing.expect(std.mem.indexOf(u8, resp.body, "Selected Order") != null);
        try std.testing.expect(std.mem.indexOf(u8, resp.body, "Skipped Order") == null);
    }
}

test "market exported manifest round trips through fresh space library listing" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    var order = try orders_mod.create(allocator, fixture.paths, "ops", .{
        .id = "portable-order",
        .title = "Portable Order",
        .kind = "policy",
        .content = "Portable policy content.",
        .created_at_ms = 1000,
        .updated_at_ms = 1000,
    });
    defer order.deinit(allocator);

    const resp = handleExport(
        allocator,
        fixture.paths,
        &state,
        "/api/market/export?space=ops",
        "{\"id\":\"export.ops.portable\",\"scope\":\"space\"}",
        5000,
    );
    defer allocator.free(resp.body);
    try std.testing.expectEqualStrings("201 Created", resp.status);

    const source_path = try fixture.paths.spacePackageLibraryManifest(allocator, "ops", "export.ops.portable");
    defer allocator.free(source_path);
    const exported = try std_compat.fs.readFileAbsolute(allocator, source_path, max_manifest_bytes);
    defer allocator.free(exported);
    try validateManifestJson(allocator, exported);

    const fresh_dir = try fixture.paths.spacePackageLibraryDir(allocator, "fresh");
    defer allocator.free(fresh_dir);
    try std_compat.fs.makePathAbsolute(fresh_dir);
    const fresh_path = try fixture.paths.spacePackageLibraryManifest(allocator, "fresh", "export.ops.portable");
    defer allocator.free(fresh_path);
    try durable_file.writeTextFileAtomically(allocator, fresh_path, std.mem.trim(u8, exported, " \t\r\n"));

    const installed = handleInstalled(allocator, fixture.paths, "/api/market/installed?space=fresh");
    defer allocator.free(installed.body);
    try std.testing.expectEqualStrings("200 OK", installed.status);
    try std.testing.expect(std.mem.indexOf(u8, installed.body, "\"id\":\"export.ops.portable\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, installed.body, "Portable Order") != null);
}

test "market installed handler requires a safe space query" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();

    {
        const resp = handleInstalled(allocator, fixture.paths, "/api/market/installed");
        try std.testing.expectEqualStrings("400 Bad Request", resp.status);
        try std.testing.expectEqualStrings("{\"error\":\"space query is required\"}", resp.body);
    }
    {
        const resp = handleInstalled(allocator, fixture.paths, "/api/market/installed?space=..");
        try std.testing.expectEqualStrings("400 Bad Request", resp.status);
        try std.testing.expectEqualStrings("{\"error\":\"invalid space id\"}", resp.body);
    }
}

test "market route helpers match catalog and installed paths" {
    try std.testing.expect(isCatalogPath("/api/market/catalog"));
    try std.testing.expect(isCatalogPath("/api/market/catalog?space=ops"));
    try std.testing.expect(isInstalledPath("/api/market/installed?space=ops"));
    try std.testing.expect(isExportPath("/api/market/export?space=ops"));
    try std.testing.expect(isLibraryDownloadPath("/api/market/library/export.ops.json?space=ops"));
    try std.testing.expect(!isCatalogPath("/api/market"));
    try std.testing.expect(!isInstalledPath("/api/market/catalog"));
    try std.testing.expect(!isExportPath("/api/market/installed"));
    try std.testing.expect(!isLibraryDownloadPath("/api/market/library/export.ops"));
}
