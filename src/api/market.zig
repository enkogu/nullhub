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
const max_install_body_bytes: usize = 1024 * 1024;

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

pub fn isInstallPath(target: []const u8) bool {
    const clean = query.stripTarget(target);
    return std.mem.eql(u8, clean, "/api/market/install");
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

pub fn handleInstall(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    target: []const u8,
    body: []const u8,
    now_ms: i64,
) helpers.ApiResponse {
    if (body.len > max_install_body_bytes) {
        return helpers.badRequest("{\"error\":\"install body is too large\"}");
    }

    const space_id = requiredSpaceQueryAlloc(allocator, target) catch |err| switch (err) {
        error.MissingSpace => return helpers.badRequest("{\"error\":\"space query is required\"}"),
        error.InvalidSpace => return helpers.badRequest("{\"error\":\"invalid space id\"}"),
        else => return helpers.serverError(),
    };
    defer allocator.free(space_id);

    const trimmed_body = std.mem.trim(u8, body, " \t\r\n");
    const json_body = if (trimmed_body.len == 0) "{}" else trimmed_body;
    var parsed_body = std.json.parseFromSlice(std.json.Value, allocator, json_body, .{
        .allocate = .alloc_always,
    }) catch return helpers.badRequest("{\"error\":\"invalid JSON body\"}");
    defer parsed_body.deinit();
    if (parsed_body.value != .object) return helpers.badRequest("{\"error\":\"install body must be an object\"}");
    const root = parsed_body.value.object;
    const dry_run = boolField(root, "dry_run") orelse boolField(root, "preview") orelse false;

    const resolved = resolveInstallManifest(allocator, paths, space_id, root) catch |err| switch (err) {
        error.MissingPackageId => return helpers.badRequest("{\"error\":\"package_id or manifest is required\"}"),
        error.InvalidPackageId => return helpers.badRequest("{\"error\":\"invalid package id\"}"),
        error.PackageNotFound => return helpers.notFound(),
        else => return helpers.serverError(),
    };
    defer resolved.deinit(allocator);

    var parsed_manifest = std.json.parseFromSlice(std.json.Value, allocator, resolved.bytes, .{
        .allocate = .alloc_always,
    }) catch return helpers.badRequest("{\"error\":\"invalid package manifest\"}");
    defer parsed_manifest.deinit();
    validateManifestValue(parsed_manifest.value) catch return helpers.badRequest("{\"error\":\"invalid package manifest\"}");
    if (parsed_manifest.value != .object) return helpers.badRequest("{\"error\":\"invalid package manifest\"}");
    const manifest_root = parsed_manifest.value.object;
    const package_id = stringField(manifest_root, "id") orelse return helpers.badRequest("{\"error\":\"invalid package manifest\"}");
    if (!isSafePackageId(package_id)) return helpers.badRequest("{\"error\":\"invalid package id\"}");
    const package_version = stringField(manifest_root, "version") orelse "";

    if (dry_run) {
        const response = renderInstallResponse(allocator, "preview", space_id, manifest_root, resolved.source, null) catch return helpers.serverError();
        return helpers.jsonOk(response);
    }

    const manifest_path = paths.spacePackageLibraryManifest(allocator, space_id, package_id) catch return helpers.serverError();
    defer allocator.free(manifest_path);
    if (fileExists(manifest_path)) {
        return .{ .status = "409 Conflict", .content_type = "application/json", .body = "{\"error\":\"package already installed\"}" };
    }

    var rollback = InstallRollback.init(allocator);
    defer rollback.deinit();
    var applied = InstallApplied.init(allocator);
    defer applied.deinit();

    applyInstallSeeds(allocator, paths, state, space_id, manifest_root, package_id, package_version, now_ms, &rollback, &applied) catch |err| {
        rollback.run(allocator, paths, state, space_id) catch {};
        state.save() catch {};
        return installErrorResponse(err);
    };

    const library_dir = paths.spacePackageLibraryDir(allocator, space_id) catch return helpers.serverError();
    defer allocator.free(library_dir);
    std_compat.fs.makePathAbsolute(library_dir) catch {
        rollback.run(allocator, paths, state, space_id) catch {};
        state.save() catch {};
        return helpers.serverError();
    };
    durable_file.writeTextFileAtomically(allocator, manifest_path, std.mem.trim(u8, resolved.bytes, " \t\r\n")) catch {
        rollback.run(allocator, paths, state, space_id) catch {};
        state.save() catch {};
        return helpers.serverError();
    };
    rollback.installed_manifest_path = allocator.dupe(u8, manifest_path) catch {
        std_compat.fs.deleteFileAbsolute(manifest_path) catch {};
        rollback.run(allocator, paths, state, space_id) catch {};
        state.save() catch {};
        return helpers.serverError();
    };

    appendPackageInstalledEvent(allocator, state, space_id, package_id, package_version, resolved.source, &applied, now_ms) catch {
        rollback.run(allocator, paths, state, space_id) catch {};
        state.save() catch {};
        return helpers.serverError();
    };
    state.save() catch {
        rollback.run(allocator, paths, state, space_id) catch {};
        state.save() catch {};
        return helpers.serverError();
    };

    const response = renderInstallResponse(allocator, "installed", space_id, manifest_root, resolved.source, &applied) catch return helpers.serverError();
    return .{ .status = "201 Created", .content_type = "application/json", .body = response };
}

const ManifestSource = struct {
    kind: []const u8,
    ref: []u8,

    fn deinit(self: ManifestSource, allocator: std.mem.Allocator) void {
        allocator.free(self.ref);
    }
};

const ResolvedManifest = struct {
    bytes: []u8,
    source: ManifestSource,

    fn deinit(self: ResolvedManifest, allocator: std.mem.Allocator) void {
        allocator.free(self.bytes);
        self.source.deinit(allocator);
    }
};

const AppliedResource = struct {
    kind: []u8,
    id: []u8,
};

const InstallApplied = struct {
    resources: std.array_list.Managed(AppliedResource),

    fn init(allocator: std.mem.Allocator) InstallApplied {
        return .{ .resources = std.array_list.Managed(AppliedResource).init(allocator) };
    }

    fn deinit(self: *InstallApplied) void {
        for (self.resources.items) |resource| {
            self.resources.allocator.free(resource.kind);
            self.resources.allocator.free(resource.id);
        }
        self.resources.deinit();
    }

    fn append(self: *InstallApplied, kind: []const u8, id: []const u8) !void {
        const owned_kind = try self.resources.allocator.dupe(u8, kind);
        errdefer self.resources.allocator.free(owned_kind);
        const owned_id = try self.resources.allocator.dupe(u8, id);
        errdefer self.resources.allocator.free(owned_id);
        try self.resources.append(.{ .kind = owned_kind, .id = owned_id });
    }
};

const InstanceRef = struct {
    component: []u8,
    name: []u8,
};

const InstallRollback = struct {
    created_orders: std.array_list.Managed([]u8),
    created_instances: std.array_list.Managed(InstanceRef),
    created_channels: std.array_list.Managed(u32),
    installed_manifest_path: ?[]u8 = null,

    fn init(allocator: std.mem.Allocator) InstallRollback {
        return .{
            .created_orders = std.array_list.Managed([]u8).init(allocator),
            .created_instances = std.array_list.Managed(InstanceRef).init(allocator),
            .created_channels = std.array_list.Managed(u32).init(allocator),
        };
    }

    fn deinit(self: *InstallRollback) void {
        for (self.created_orders.items) |id| self.created_orders.allocator.free(id);
        self.created_orders.deinit();
        for (self.created_instances.items) |ref| {
            self.created_instances.allocator.free(ref.component);
            self.created_instances.allocator.free(ref.name);
        }
        self.created_instances.deinit();
        self.created_channels.deinit();
        if (self.installed_manifest_path) |path| self.created_orders.allocator.free(path);
    }

    fn rememberOrder(self: *InstallRollback, order_id: []const u8) !void {
        try self.created_orders.append(try self.created_orders.allocator.dupe(u8, order_id));
    }

    fn rememberInstance(self: *InstallRollback, component: []const u8, name: []const u8) !void {
        const owned_component = try self.created_instances.allocator.dupe(u8, component);
        errdefer self.created_instances.allocator.free(owned_component);
        const owned_name = try self.created_instances.allocator.dupe(u8, name);
        errdefer self.created_instances.allocator.free(owned_name);
        try self.created_instances.append(.{ .component = owned_component, .name = owned_name });
    }

    fn rememberChannel(self: *InstallRollback, id: u32) !void {
        try self.created_channels.append(id);
    }

    fn run(self: *InstallRollback, allocator: std.mem.Allocator, paths: paths_mod.Paths, state: *state_mod.State, space_id: []const u8) !void {
        if (self.installed_manifest_path) |path| {
            std_compat.fs.deleteFileAbsolute(path) catch |err| switch (err) {
                error.FileNotFound => {},
                else => return err,
            };
        }
        var order_idx = self.created_orders.items.len;
        while (order_idx > 0) {
            order_idx -= 1;
            var removed = orders_mod.remove(allocator, paths, space_id, self.created_orders.items[order_idx]) catch |err| switch (err) {
                error.OrderNotFound => continue,
                else => return err,
            };
            removed.deinit(allocator);
        }
        var instance_idx = self.created_instances.items.len;
        while (instance_idx > 0) {
            instance_idx -= 1;
            const ref = self.created_instances.items[instance_idx];
            _ = state.removeInstance(ref.component, ref.name);
        }
        var channel_idx = self.created_channels.items.len;
        while (channel_idx > 0) {
            channel_idx -= 1;
            _ = state.removeSavedChannel(self.created_channels.items[channel_idx]);
        }
    }
};

fn resolveInstallManifest(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    space_id: []const u8,
    root: std.json.ObjectMap,
) !ResolvedManifest {
    if (root.get("manifest")) |manifest_value| {
        if (manifest_value != .object) return error.InvalidManifest;
        const bytes = try std.json.Stringify.valueAlloc(allocator, manifest_value, .{});
        errdefer allocator.free(bytes);
        return .{
            .bytes = bytes,
            .source = .{ .kind = "inline", .ref = try allocator.dupe(u8, "inline") },
        };
    }

    const package_id = stringField(root, "package_id") orelse stringField(root, "id") orelse stringField(root, "package") orelse
        return error.MissingPackageId;
    if (!isSafePackageId(package_id)) return error.InvalidPackageId;

    const requested_source = stringField(root, "source") orelse "";
    if (std.mem.eql(u8, requested_source, "library")) {
        const bytes = try readLibraryManifestById(allocator, paths, space_id, package_id);
        errdefer allocator.free(bytes);
        return .{
            .bytes = bytes,
            .source = .{ .kind = "library", .ref = try allocator.dupe(u8, package_id) },
        };
    }

    if (try readCatalogManifestById(allocator, package_id)) |bytes| {
        errdefer allocator.free(bytes);
        return .{
            .bytes = bytes,
            .source = .{ .kind = "catalog", .ref = try allocator.dupe(u8, package_id) },
        };
    }

    if (std.mem.eql(u8, requested_source, "catalog")) return error.PackageNotFound;

    const bytes = try readLibraryManifestById(allocator, paths, space_id, package_id);
    errdefer allocator.free(bytes);
    return .{
        .bytes = bytes,
        .source = .{ .kind = "library", .ref = try allocator.dupe(u8, package_id) },
    };
}

fn readCatalogManifestById(allocator: std.mem.Allocator, package_id: []const u8) !?[]u8 {
    const catalog_dir = try resolveBuiltinCatalogDir(allocator);
    defer allocator.free(catalog_dir);
    return try readManifestFromDirById(allocator, catalog_dir, package_id);
}

fn readLibraryManifestById(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, package_id: []const u8) ![]u8 {
    const manifest_path = try paths.spacePackageLibraryManifest(allocator, space_id, package_id);
    defer allocator.free(manifest_path);
    return std_compat.fs.readFileAbsolute(allocator, manifest_path, max_manifest_bytes) catch |err| switch (err) {
        error.FileNotFound => error.PackageNotFound,
        else => err,
    };
}

fn readManifestFromDirById(allocator: std.mem.Allocator, dir_path: []const u8, package_id: []const u8) !?[]u8 {
    var dir = openDirAny(dir_path, .{ .iterate = true }) catch |err| switch (err) {
        error.FileNotFound => return null,
        else => return err,
    };
    defer dir.close();

    var it = dir.iterate();
    while (try it.next()) |entry| {
        if (entry.kind != .file) continue;
        if (!std.mem.endsWith(u8, entry.name, ".json")) continue;
        const raw = try dir.readFileAlloc(allocator, entry.name, max_manifest_bytes);
        errdefer allocator.free(raw);
        var parsed = std.json.parseFromSlice(std.json.Value, allocator, raw, .{ .allocate = .alloc_always }) catch {
            allocator.free(raw);
            return error.InvalidManifest;
        };
        defer parsed.deinit();
        if (parsed.value != .object) {
            allocator.free(raw);
            return error.InvalidManifest;
        }
        if (stringField(parsed.value.object, "id")) |id| {
            if (std.mem.eql(u8, id, package_id)) return raw;
        }
        allocator.free(raw);
    }
    return null;
}

fn applyInstallSeeds(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    state: *state_mod.State,
    space_id: []const u8,
    manifest_root: std.json.ObjectMap,
    package_id: []const u8,
    package_version: []const u8,
    now_ms: i64,
    rollback: *InstallRollback,
    applied: *InstallApplied,
) !void {
    const seeds = manifest_root.get("seeds") orelse return error.InvalidManifest;
    if (seeds != .array) return error.InvalidManifest;

    for (seeds.array.items) |seed| {
        if (seed != .object) return error.InvalidSeed;
        const seed_kind = stringField(seed.object, "kind") orelse return error.InvalidSeed;
        if (isOrderLikeSeed(seed_kind)) {
            try installOrderLikeSeed(allocator, paths, space_id, seed.object, seed_kind, package_id, package_version, now_ms, rollback, applied);
        } else if (std.mem.eql(u8, seed_kind, "instance")) {
            try installInstanceSeed(allocator, state, manifest_root, space_id, seed.object, package_id, package_version, rollback, applied);
        } else if (std.mem.eql(u8, seed_kind, "channel")) {
            try installChannelSeed(allocator, state, space_id, seed.object, rollback, applied);
        } else if (isReferenceOnlySeed(seed_kind)) {
            const seed_id = seedIdentifier(seed.object) orelse seed_kind;
            try applied.append(seed_kind, seed_id);
        } else {
            return error.UnsupportedSeedKind;
        }
    }
}

fn isOrderLikeSeed(seed_kind: []const u8) bool {
    return std.mem.eql(u8, seed_kind, "order") or
        std.mem.eql(u8, seed_kind, "order_template") or
        std.mem.eql(u8, seed_kind, "loop_template") or
        std.mem.eql(u8, seed_kind, "loop") or
        std.mem.eql(u8, seed_kind, "workflow_template");
}

fn isReferenceOnlySeed(seed_kind: []const u8) bool {
    return std.mem.eql(u8, seed_kind, "space") or
        std.mem.eql(u8, seed_kind, "provider") or
        std.mem.eql(u8, seed_kind, "mcp_server") or
        std.mem.eql(u8, seed_kind, "skill") or
        std.mem.eql(u8, seed_kind, "agent_profile");
}

fn installOrderLikeSeed(
    allocator: std.mem.Allocator,
    paths: paths_mod.Paths,
    space_id: []const u8,
    seed: std.json.ObjectMap,
    seed_kind: []const u8,
    package_id: []const u8,
    package_version: []const u8,
    now_ms: i64,
    rollback: *InstallRollback,
    applied: *InstallApplied,
) !void {
    const order_id = try orderIdForSeed(allocator, package_id, seed);
    defer allocator.free(order_id);
    if (!orders_mod.isValidOrderId(order_id)) return error.InvalidSeed;

    if (orders_mod.get(allocator, paths, space_id, order_id)) |existing| {
        var owned = existing;
        owned.deinit(allocator);
        return error.DuplicateOrder;
    } else |err| switch (err) {
        error.OrderNotFound => {},
        else => return err,
    }

    const title = stringField(seed, "title") orelse stringField(seed, "name") orelse order_id;
    const summary = stringField(seed, "summary") orelse stringField(seed, "description") orelse stringField(seed, "tagline") orelse "";
    const order_kind = orderKindForSeed(seed, seed_kind);
    const schedule = stringField(seed, "schedule") orelse "manual";
    const content = try orderContentForSeed(allocator, seed, seed_kind, package_id, package_version, order_id);
    defer allocator.free(content);

    var created = try orders_mod.create(allocator, paths, space_id, .{
        .id = order_id,
        .title = title,
        .summary = summary,
        .kind = order_kind,
        .goal = stringField(seed, "goal") orelse "",
        .schedule = schedule,
        .content = content,
        .created_at_ms = now_ms,
        .updated_at_ms = now_ms,
    });
    defer created.deinit(allocator);
    try rollback.rememberOrder(order_id);

    const status = stringField(seed, "status") orelse "draft";
    if (!std.mem.eql(u8, status, "draft")) {
        const parsed_status = orders_mod.Status.fromString(status) orelse return error.InvalidSeed;
        var updated = try orders_mod.update(allocator, paths, space_id, order_id, .{
            .status = parsed_status,
            .updated_at_ms = now_ms,
        });
        updated.deinit(allocator);
    }

    try applied.append("order", order_id);
}

fn installInstanceSeed(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    manifest_root: std.json.ObjectMap,
    space_id: []const u8,
    seed: std.json.ObjectMap,
    package_id: []const u8,
    package_version: []const u8,
    rollback: *InstallRollback,
    applied: *InstallApplied,
) !void {
    const component = stringField(seed, "component") orelse manifestConfigString(manifest_root, "component") orelse return error.MissingComponent;
    const name = stringField(seed, "name") orelse stringField(seed, "instance_name") orelse return error.MissingName;
    if (state.getInstance(component, name) != null) return error.DuplicateInstance;

    const source = try sourceTagAlloc(allocator, package_id, package_version, "instance", name);
    defer allocator.free(source);
    try state.addInstance(component, name, .{
        .version = stringField(seed, "version") orelse package_version,
        .auto_start = boolField(seed, "auto_start") orelse false,
        .launch_mode = stringField(seed, "launch_mode") orelse manifestConfigString(manifest_root, "launch_mode") orelse "managed",
        .storage_mode = stringField(seed, "storage_mode") orelse "",
        .source_path = source,
        .space_id = space_id,
    });
    try rollback.rememberInstance(component, name);

    const ref = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ component, name });
    defer allocator.free(ref);
    try applied.append("instance", ref);
}

fn installChannelSeed(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    space_id: []const u8,
    seed: std.json.ObjectMap,
    rollback: *InstallRollback,
    applied: *InstallApplied,
) !void {
    const channel_type = stringField(seed, "channel_type") orelse stringField(seed, "type") orelse stringField(seed, "name") orelse return error.InvalidSeed;
    const account = stringField(seed, "account") orelse stringField(seed, "name") orelse channel_type;
    const config = try configJsonForSeed(allocator, seed);
    defer allocator.free(config);

    try state.addSavedChannel(.{
        .channel_type = channel_type,
        .account = account,
        .config = config,
        .space_id = space_id,
    });
    const id = state.savedChannels()[state.savedChannels().len - 1].id;
    try rollback.rememberChannel(id);
    if (stringField(seed, "name")) |name| {
        _ = try state.updateSavedChannel(id, .{ .name = name });
    }

    const ref = try std.fmt.allocPrint(allocator, "{s}.{d}", .{ channel_type, id });
    defer allocator.free(ref);
    try applied.append("channel", ref);
}

fn orderKindForSeed(seed: std.json.ObjectMap, seed_kind: []const u8) []const u8 {
    if (stringField(seed, "order_kind")) |value| return value;
    if (std.mem.eql(u8, seed_kind, "loop_template") or std.mem.eql(u8, seed_kind, "loop")) return "loop";
    if (std.mem.eql(u8, seed_kind, "workflow_template")) return "workflow";
    if (std.mem.eql(u8, seed_kind, "order_template")) return "template";
    return "mandate";
}

fn orderContentForSeed(
    allocator: std.mem.Allocator,
    seed: std.json.ObjectMap,
    seed_kind: []const u8,
    package_id: []const u8,
    package_version: []const u8,
    order_id: []const u8,
) ![]u8 {
    const raw_content = if (stringField(seed, "content")) |content|
        try allocator.dupe(u8, content)
    else
        try renderOrderSeedBody(allocator, seed, seed_kind);
    defer allocator.free(raw_content);

    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    try appendSourceComment(&buf, package_id, package_version, seed_kind, order_id);
    if (raw_content.len > 0) {
        if (!std.mem.endsWith(u8, buf.items, "\n")) try buf.append('\n');
        try buf.appendSlice(raw_content);
    }
    return buf.toOwnedSlice();
}

fn renderOrderSeedBody(allocator: std.mem.Allocator, seed: std.json.ObjectMap, seed_kind: []const u8) ![]u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    const title = stringField(seed, "title") orelse stringField(seed, "name") orelse seedIdentifier(seed) orelse seed_kind;
    try buf.appendSlice("# ");
    try buf.appendSlice(title);
    try buf.appendSlice("\n\n");
    if (stringField(seed, "description") orelse stringField(seed, "summary")) |summary| {
        try buf.appendSlice(summary);
        try buf.appendSlice("\n\n");
    }
    if (stringField(seed, "goal")) |goal| {
        try buf.appendSlice("## Goal\n");
        try buf.appendSlice(goal);
        try buf.appendSlice("\n\n");
    }
    if (stringField(seed, "exit_condition")) |exit_condition| {
        try buf.appendSlice("## Exit\n");
        try buf.appendSlice(exit_condition);
        try buf.appendSlice("\n\n");
    }
    if (stringField(seed, "check_instruction")) |check_instruction| {
        try buf.appendSlice("## Check\n");
        try buf.appendSlice(check_instruction);
        try buf.appendSlice("\n\n");
    }
    if (seed.get("payload")) |payload| {
        const payload_json = try std.json.Stringify.valueAlloc(allocator, payload, .{ .whitespace = .indent_2 });
        defer allocator.free(payload_json);
        try buf.appendSlice("## Payload\n```json\n");
        try buf.appendSlice(payload_json);
        try buf.appendSlice("\n```\n");
    }
    return buf.toOwnedSlice();
}

fn appendSourceComment(
    buf: *std.array_list.Managed(u8),
    package_id: []const u8,
    package_version: []const u8,
    seed_kind: []const u8,
    seed_id: []const u8,
) !void {
    try buf.appendSlice("<!-- nullhub-package-source {\"package_id\":\"");
    try appendEscaped(buf, package_id);
    try buf.appendSlice("\",\"version\":\"");
    try appendEscaped(buf, package_version);
    try buf.appendSlice("\",\"seed_kind\":\"");
    try appendEscaped(buf, seed_kind);
    try buf.appendSlice("\",\"seed_id\":\"");
    try appendEscaped(buf, seed_id);
    try buf.appendSlice("\"} -->\n");
}

fn orderIdForSeed(allocator: std.mem.Allocator, package_id: []const u8, seed: std.json.ObjectMap) ![]u8 {
    if (stringField(seed, "id")) |id| {
        if (orders_mod.isValidOrderId(id)) return allocator.dupe(u8, id);
    }
    if (stringField(seed, "slug")) |slug| {
        return prefixedSeedId(allocator, package_id, slug);
    }
    if (stringField(seed, "name") orelse stringField(seed, "title")) |name| {
        const slug = try slugify(allocator, name);
        defer allocator.free(slug);
        return prefixedSeedId(allocator, package_id, slug);
    }
    return error.InvalidSeed;
}

fn prefixedSeedId(allocator: std.mem.Allocator, package_id: []const u8, seed_id: []const u8) ![]u8 {
    const package_slug = try slugify(allocator, package_id);
    defer allocator.free(package_slug);
    const seed_slug = try slugify(allocator, seed_id);
    defer allocator.free(seed_slug);
    const joined = try std.fmt.allocPrint(allocator, "{s}.{s}", .{ package_slug, seed_slug });
    errdefer allocator.free(joined);
    if (joined.len <= 96) return joined;
    const max_order_id_len: usize = 96;
    const suffix_len: usize = @min(seed_slug.len, 48);
    const prefix_len: usize = @min(package_slug.len, max_order_id_len - suffix_len - 1);
    allocator.free(joined);
    return std.fmt.allocPrint(allocator, "{s}.{s}", .{ package_slug[0..prefix_len], seed_slug[0..suffix_len] });
}

fn slugify(allocator: std.mem.Allocator, value: []const u8) ![]u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    var last_dash = false;
    for (value) |byte| {
        const out: ?u8 = if (byte >= 'A' and byte <= 'Z')
            byte + 32
        else if ((byte >= 'a' and byte <= 'z') or (byte >= '0' and byte <= '9') or byte == '_' or byte == '.')
            byte
        else if (byte == '-' or byte == ' ' or byte == '/')
            '-'
        else
            null;
        if (out) |char| {
            if (char == '-') {
                if (last_dash or buf.items.len == 0) continue;
                last_dash = true;
            } else {
                last_dash = false;
            }
            try buf.append(char);
        }
    }
    while (buf.items.len > 0 and buf.items[buf.items.len - 1] == '-') {
        _ = buf.pop();
    }
    if (buf.items.len == 0) try buf.appendSlice("seed");
    return buf.toOwnedSlice();
}

fn seedIdentifier(seed: std.json.ObjectMap) ?[]const u8 {
    return stringField(seed, "id") orelse
        stringField(seed, "slug") orelse
        stringField(seed, "name") orelse
        stringField(seed, "title") orelse
        stringField(seed, "component") orelse
        stringField(seed, "channel_type");
}

fn manifestConfigString(root: std.json.ObjectMap, key: []const u8) ?[]const u8 {
    const config = root.get("config") orelse return null;
    if (config != .object) return null;
    return stringField(config.object, key);
}

fn configJsonForSeed(allocator: std.mem.Allocator, seed: std.json.ObjectMap) ![]u8 {
    const config = seed.get("config") orelse return allocator.dupe(u8, "{}");
    return try std.json.Stringify.valueAlloc(allocator, config, .{});
}

fn renderInstallResponse(
    allocator: std.mem.Allocator,
    status: []const u8,
    space_id: []const u8,
    manifest_root: std.json.ObjectMap,
    source: ManifestSource,
    applied: ?*const InstallApplied,
) ![]u8 {
    const package_id = stringField(manifest_root, "id") orelse "";
    const package_version = stringField(manifest_root, "version") orelse "";
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();
    try buf.appendSlice("{\"status\":\"");
    try appendEscaped(&buf, status);
    try buf.appendSlice("\",\"space_id\":\"");
    try appendEscaped(&buf, space_id);
    try buf.appendSlice("\",\"package_id\":\"");
    try appendEscaped(&buf, package_id);
    try buf.appendSlice("\",\"version\":\"");
    try appendEscaped(&buf, package_version);
    try buf.appendSlice("\",\"source\":");
    try appendSourceObject(&buf, package_id, package_version, source);
    try buf.appendSlice(",\"required_secrets\":[");
    try appendRequiredSecrets(&buf, .{ .object = manifest_root });
    try buf.appendSlice("],\"blast_radius\":");
    try appendBlastRadius(&buf, manifest_root);
    try buf.appendSlice(",\"applied\":");
    try appendAppliedResources(&buf, applied);
    try buf.appendSlice("}");
    return buf.toOwnedSlice();
}

fn appendSourceObject(buf: *std.array_list.Managed(u8), package_id: []const u8, package_version: []const u8, source: ManifestSource) !void {
    try buf.appendSlice("{\"kind\":\"");
    try appendEscaped(buf, source.kind);
    try buf.appendSlice("\",\"ref\":\"");
    try appendEscaped(buf, source.ref);
    try buf.appendSlice("\",\"source_tag\":\"");
    const tag = try sourceTagAlloc(buf.allocator, package_id, package_version, "package", package_id);
    defer buf.allocator.free(tag);
    try appendEscaped(buf, tag);
    try buf.appendSlice("\"}");
}

fn appendRequiredSecrets(buf: *std.array_list.Managed(u8), value: std.json.Value) !void {
    var seen = std.StringHashMap(void).init(buf.allocator);
    defer seen.deinit();
    var first = true;
    try appendRequiredSecretsFromValue(buf, value, &seen, &first);
}

fn appendRequiredSecretsFromValue(
    buf: *std.array_list.Managed(u8),
    value: std.json.Value,
    seen: *std.StringHashMap(void),
    first: *bool,
) !void {
    switch (value) {
        .object => |object| {
            if (stringField(object, "secret_ref")) |secret_ref| {
                if (!seen.contains(secret_ref)) {
                    try seen.put(secret_ref, {});
                    if (!first.*) try buf.append(',');
                    first.* = false;
                    try buf.appendSlice("{\"name\":\"");
                    try appendEscaped(buf, stringField(object, "name") orelse stringField(object, "id") orelse secret_ref);
                    try buf.appendSlice("\",\"secret_ref\":\"");
                    try appendEscaped(buf, secret_ref);
                    try buf.appendSlice("\"}");
                }
            }
            var it = object.iterator();
            while (it.next()) |entry| {
                try appendRequiredSecretsFromValue(buf, entry.value_ptr.*, seen, first);
            }
        },
        .array => |array| {
            for (array.items) |item| try appendRequiredSecretsFromValue(buf, item, seen, first);
        },
        else => {},
    }
}

fn appendBlastRadius(buf: *std.array_list.Managed(u8), manifest_root: std.json.ObjectMap) !void {
    var order_count: usize = 0;
    var instance_count: usize = 0;
    var channel_count: usize = 0;
    var reference_count: usize = 0;
    var unsupported_count: usize = 0;
    const seeds = manifest_root.get("seeds");
    if (seeds) |value| {
        if (value == .array) {
            for (value.array.items) |seed| {
                if (seed != .object) continue;
                const kind = stringField(seed.object, "kind") orelse continue;
                if (isOrderLikeSeed(kind)) {
                    order_count += 1;
                } else if (std.mem.eql(u8, kind, "instance")) {
                    instance_count += 1;
                } else if (std.mem.eql(u8, kind, "channel")) {
                    channel_count += 1;
                } else if (isReferenceOnlySeed(kind)) {
                    reference_count += 1;
                } else {
                    unsupported_count += 1;
                }
            }
        }
    }

    try buf.appendSlice("{\"seed_count\":");
    try appendFmt(buf, "{d}", .{order_count + instance_count + channel_count + reference_count + unsupported_count});
    try buf.appendSlice(",\"orders\":");
    try appendFmt(buf, "{d}", .{order_count});
    try buf.appendSlice(",\"instances\":");
    try appendFmt(buf, "{d}", .{instance_count});
    try buf.appendSlice(",\"channels\":");
    try appendFmt(buf, "{d}", .{channel_count});
    try buf.appendSlice(",\"reference_only\":");
    try appendFmt(buf, "{d}", .{reference_count});
    try buf.appendSlice(",\"unsupported\":");
    try appendFmt(buf, "{d}", .{unsupported_count});
    try buf.appendSlice(",\"contributes\":");
    try appendContributionSummary(buf, manifest_root);
    try buf.appendSlice("}");
}

fn appendContributionSummary(buf: *std.array_list.Managed(u8), manifest_root: std.json.ObjectMap) !void {
    const contributes = manifest_root.get("contributes") orelse {
        try buf.appendSlice("[]");
        return;
    };
    if (contributes != .array) {
        try buf.appendSlice("[]");
        return;
    }
    try buf.append('[');
    var first = true;
    for (contributes.array.items) |item| {
        if (item != .object) continue;
        if (!first) try buf.append(',');
        first = false;
        try buf.appendSlice("{\"kind\":\"");
        try appendEscaped(buf, stringField(item.object, "kind") orelse "contribution");
        try buf.appendSlice("\",\"name\":\"");
        try appendEscaped(buf, stringField(item.object, "name") orelse stringField(item.object, "target") orelse stringField(item.object, "package") orelse "");
        try buf.appendSlice("\"}");
    }
    try buf.append(']');
}

fn appendAppliedResources(buf: *std.array_list.Managed(u8), applied: ?*const InstallApplied) !void {
    try buf.appendSlice("{\"resources\":[");
    if (applied) |result| {
        for (result.resources.items, 0..) |resource, idx| {
            if (idx > 0) try buf.append(',');
            try buf.appendSlice("{\"kind\":\"");
            try appendEscaped(buf, resource.kind);
            try buf.appendSlice("\",\"id\":\"");
            try appendEscaped(buf, resource.id);
            try buf.appendSlice("\"}");
        }
    }
    try buf.appendSlice("]}");
}

fn appendPackageInstalledEvent(
    allocator: std.mem.Allocator,
    state: *state_mod.State,
    space_id: []const u8,
    package_id: []const u8,
    package_version: []const u8,
    source: ManifestSource,
    applied: *const InstallApplied,
    now_ms: i64,
) !void {
    var payload = std.array_list.Managed(u8).init(allocator);
    defer payload.deinit();
    try payload.appendSlice("{\"version\":\"");
    try appendEscaped(&payload, package_version);
    try payload.appendSlice("\",\"source\":");
    try appendSourceObject(&payload, package_id, package_version, source);
    try payload.appendSlice(",\"applied\":");
    try appendAppliedResources(&payload, applied);
    try payload.appendSlice("}");

    _ = try state.addEvent(.{
        .space_id = space_id,
        .event_type = "package.installed",
        .source = "nullhub",
        .subject_type = "package",
        .subject_id = package_id,
        .title = "Package installed",
        .summary = "Package manifest installed into the selected Space.",
        .severity = "info",
        .payload_json = payload.items,
        .created_at_ms = now_ms,
    });
}

fn sourceTagAlloc(
    allocator: std.mem.Allocator,
    package_id: []const u8,
    package_version: []const u8,
    seed_kind: []const u8,
    seed_id: []const u8,
) ![]u8 {
    return std.fmt.allocPrint(allocator, "market://package/{s}@{s}#{s}:{s}", .{ package_id, package_version, seed_kind, seed_id });
}

fn fileExists(path: []const u8) bool {
    var file = std_compat.fs.openFileAbsolute(path, .{}) catch return false;
    file.close();
    return true;
}

fn installErrorResponse(err: anyerror) helpers.ApiResponse {
    return switch (err) {
        error.DuplicateOrder, error.DuplicateInstance => .{ .status = "409 Conflict", .content_type = "application/json", .body = "{\"error\":\"install target already exists\"}" },
        error.UnsupportedSeedKind => .{ .status = "422 Unprocessable Entity", .content_type = "application/json", .body = "{\"error\":\"unsupported package seed kind\"}" },
        error.InvalidSeed, error.InvalidManifest, error.MissingComponent, error.MissingName => helpers.badRequest("{\"error\":\"invalid package manifest\"}"),
        else => helpers.serverError(),
    };
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

fn boolField(object: std.json.ObjectMap, key: []const u8) ?bool {
    const value = object.get(key) orelse return null;
    return switch (value) {
        .bool => |raw| raw,
        .string => |raw| if (std.ascii.eqlIgnoreCase(raw, "true"))
            true
        else if (std.ascii.eqlIgnoreCase(raw, "false"))
            false
        else
            null,
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

    try validateNoLiteralSecrets(value);
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

fn isForbiddenSecretKey(key: []const u8) bool {
    return std.mem.eql(u8, key, "secret_value") or
        std.mem.eql(u8, key, "encrypted_secret_value") or
        std.mem.eql(u8, key, "encrypted_value");
}

fn validateNoLiteralSecrets(value: std.json.Value) ValidationError!void {
    switch (value) {
        .object => |object| {
            var it = object.iterator();
            while (it.next()) |entry| {
                const key = entry.key_ptr.*;
                const child = entry.value_ptr.*;
                if (isForbiddenSecretKey(key)) return error.SecretValueNotAllowed;
                if (isSecretContractKey(key)) {
                    try validateNoLiteralSecrets(child);
                    continue;
                }
                if (isSecretishKey(key)) {
                    try validateSecretSlotValue(child);
                    continue;
                }
                try validateNoLiteralSecrets(child);
            }
        },
        .array => |array| {
            for (array.items) |item| try validateNoLiteralSecrets(item);
        },
        else => {},
    }
}

fn isSecretContractKey(key: []const u8) bool {
    return std.mem.eql(u8, key, "secret_ref") or
        std.mem.eql(u8, key, "secrets") or
        std.mem.eql(u8, key, "required_secrets");
}

fn validateSecretSlotValue(value: std.json.Value) ValidationError!void {
    const object = switch (value) {
        .object => |raw| raw,
        else => return error.SecretValueNotAllowed,
    };
    try validateSecretRefObject(object);
    try validateNoLiteralSecrets(value);
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

test "market manifest rejects literal secret-like install keys" {
    const allocator = std.testing.allocator;
    try std.testing.expectError(error.SecretValueNotAllowed, validateManifestJson(allocator, "{\"id\":\"example.provider-literal\",\"name\":\"Provider literal\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[{\"kind\":\"provider\",\"provider\":\"openrouter\",\"api_key\":\"sk-literal\"}],\"extends\":[],\"charter\":{}}"));
    try std.testing.expectError(error.SecretValueNotAllowed, validateManifestJson(allocator, "{\"id\":\"example.channel-literal\",\"name\":\"Channel literal\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[{\"kind\":\"channel\",\"channel_type\":\"telegram\",\"config\":{\"bot_token\":\"literal-token\"}}],\"extends\":[],\"charter\":{}}"));
    try validateManifestJson(allocator, "{\"id\":\"example.channel-ref\",\"name\":\"Channel ref\",\"version\":\"1.0.0\",\"scale\":\"component\",\"requires\":[],\"contributes\":[],\"config\":{},\"seeds\":[{\"kind\":\"channel\",\"channel_type\":\"telegram\",\"config\":{\"bot_token\":{\"secret_ref\":\"channels.telegram.ops.bot_token\"}}}],\"extends\":[],\"charter\":{}}");
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

test "market exported manifest round trips through fresh space install" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    _ = try state.addSpace(.{ .id = "ops", .name = "Ops", .kind = "workspace", .stage = "active" });
    _ = try state.addSpace(.{ .id = "fresh", .name = "Fresh", .kind = "workspace", .stage = "active" });
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

    const install_body = try std.fmt.allocPrint(allocator, "{{\"manifest\":{s}}}", .{std.mem.trim(u8, exported, " \t\r\n")});
    defer allocator.free(install_body);
    const install = handleInstall(allocator, fixture.paths, &state, "/api/market/install?space=fresh", install_body, 6000);
    defer allocator.free(install.body);
    try std.testing.expectEqualStrings("201 Created", install.status);
    try std.testing.expect(std.mem.indexOf(u8, install.body, "\"kind\":\"space\"") != null);

    var fresh_order = try orders_mod.get(allocator, fixture.paths, "fresh", "portable-order");
    defer fresh_order.deinit(allocator);
    try std.testing.expectEqualStrings("Portable Order", fresh_order.title);

    const installed = handleInstalled(allocator, fixture.paths, "/api/market/installed?space=fresh");
    defer allocator.free(installed.body);
    try std.testing.expectEqualStrings("200 OK", installed.status);
    try std.testing.expect(std.mem.indexOf(u8, installed.body, "\"id\":\"export.ops.portable\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, installed.body, "Portable Order") != null);
}

test "market install rejects literal provider api key before persisting" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    const resp = handleInstall(
        allocator,
        fixture.paths,
        &state,
        "/api/market/install?space=ops",
        \\{
        \\  "manifest": {
        \\    "id": "test.literal-provider-secret",
        \\    "name": "Literal Provider Secret",
        \\    "version": "1.0.0",
        \\    "scale": "component",
        \\    "requires": [],
        \\    "contributes": [],
        \\    "config": {},
        \\    "seeds": [
        \\      { "kind": "provider", "provider": "openrouter", "name": "OpenRouter", "api_key": "sk-literal-provider" }
        \\    ],
        \\    "extends": [],
        \\    "charter": {}
        \\  }
        \\}
    ,
        6100,
    );
    try std.testing.expectEqualStrings("400 Bad Request", resp.status);
    try std.testing.expectEqualStrings("{\"error\":\"invalid package manifest\"}", resp.body);
    try std.testing.expectEqual(@as(usize, 0), state.eventsList().len);

    const manifest_path = try fixture.paths.spacePackageLibraryManifest(allocator, "ops", "test.literal-provider-secret");
    defer allocator.free(manifest_path);
    try std.testing.expectError(error.FileNotFound, std_compat.fs.readFileAbsolute(allocator, manifest_path, max_manifest_bytes));
}

test "market install rejects literal channel bot token before persisting" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    const resp = handleInstall(
        allocator,
        fixture.paths,
        &state,
        "/api/market/install?space=ops",
        \\{
        \\  "manifest": {
        \\    "id": "test.literal-channel-secret",
        \\    "name": "Literal Channel Secret",
        \\    "version": "1.0.0",
        \\    "scale": "component",
        \\    "requires": [],
        \\    "contributes": [],
        \\    "config": {},
        \\    "seeds": [
        \\      {
        \\        "kind": "channel",
        \\        "channel_type": "telegram",
        \\        "account": "@ops",
        \\        "config": {
        \\          "bot_token": "literal-bot-token",
        \\          "chat_id": "123"
        \\        }
        \\      }
        \\    ],
        \\    "extends": [],
        \\    "charter": {}
        \\  }
        \\}
    ,
        6200,
    );
    try std.testing.expectEqualStrings("400 Bad Request", resp.status);
    try std.testing.expectEqualStrings("{\"error\":\"invalid package manifest\"}", resp.body);
    try std.testing.expectEqual(@as(usize, 0), state.savedChannels().len);
    try std.testing.expectEqual(@as(usize, 0), state.eventsList().len);

    const manifest_path = try fixture.paths.spacePackageLibraryManifest(allocator, "ops", "test.literal-channel-secret");
    defer allocator.free(manifest_path);
    try std.testing.expectError(error.FileNotFound, std_compat.fs.readFileAbsolute(allocator, manifest_path, max_manifest_bytes));
}

test "market install rejects literal secrets from library source before applying" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    const library_dir = try fixture.paths.spacePackageLibraryDir(allocator, "ops");
    defer allocator.free(library_dir);
    try std_compat.fs.makePathAbsolute(library_dir);
    var library = try std_compat.fs.openDirAbsolute(library_dir, .{});
    defer library.close();
    try writeManifest(library, "test.library-literal-secret.json",
        \\{
        \\  "id": "test.library-literal-secret",
        \\  "name": "Library Literal Secret",
        \\  "version": "1.0.0",
        \\  "scale": "component",
        \\  "requires": [],
        \\  "contributes": [],
        \\  "config": {},
        \\  "seeds": [
        \\    {
        \\      "kind": "channel",
        \\      "channel_type": "telegram",
        \\      "account": "@ops",
        \\      "config": {
        \\        "bot_token": "literal-library-token"
        \\      }
        \\    }
        \\  ],
        \\  "extends": [],
        \\  "charter": {}
        \\}
    );

    const resp = handleInstall(
        allocator,
        fixture.paths,
        &state,
        "/api/market/install?space=ops",
        "{\"package_id\":\"test.library-literal-secret\",\"source\":\"library\"}",
        6300,
    );
    try std.testing.expectEqualStrings("400 Bad Request", resp.status);
    try std.testing.expectEqualStrings("{\"error\":\"invalid package manifest\"}", resp.body);
    try std.testing.expectEqual(@as(usize, 0), state.savedChannels().len);
    try std.testing.expectEqual(@as(usize, 0), state.eventsList().len);
}

test "market install dry run reports blast radius and required secrets without mutation" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    const resp = handleInstall(
        allocator,
        fixture.paths,
        &state,
        "/api/market/install?space=ops",
        \\{
        \\  "dry_run": true,
        \\  "manifest": {
        \\    "id": "test.preview-install",
        \\    "name": "Preview Install",
        \\    "version": "1.0.0",
        \\    "scale": "kit",
        \\    "requires": [
        \\      { "kind": "secret_ref", "name": "model", "secret_ref": "providers.default.api_key" }
        \\    ],
        \\    "contributes": [
        \\      { "kind": "order_template", "name": "Daily Ops" }
        \\    ],
        \\    "config": {
        \\      "secrets": [
        \\        { "name": "model", "secret_ref": "providers.default.api_key" }
        \\      ]
        \\    },
        \\    "seeds": [
        \\      { "kind": "order", "id": "daily-ops", "title": "Daily Ops", "order_kind": "loop", "content": "Run the daily ops loop." }
        \\    ],
        \\    "extends": [],
        \\    "charter": {}
        \\  }
        \\}
    ,
        6000,
    );
    defer allocator.free(resp.body);
    try std.testing.expectEqualStrings("200 OK", resp.status);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"status\":\"preview\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"secret_ref\":\"providers.default.api_key\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"orders\":1") != null);

    const orders = try orders_mod.list(allocator, fixture.paths, "ops");
    defer allocator.free(orders);
    try std.testing.expectEqual(@as(usize, 0), orders.len);
    try std.testing.expectEqual(@as(usize, 0), state.eventsList().len);

    const manifest_path = try fixture.paths.spacePackageLibraryManifest(allocator, "ops", "test.preview-install");
    defer allocator.free(manifest_path);
    try std.testing.expectError(error.FileNotFound, std_compat.fs.readFileAbsolute(allocator, manifest_path, max_manifest_bytes));
}

test "market install applies full package and preserves source tag traceability" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    const resp = handleInstall(
        allocator,
        fixture.paths,
        &state,
        "/api/market/install?space=ops",
        \\{
        \\  "manifest": {
        \\    "id": "test.full-install",
        \\    "name": "Full Install",
        \\    "version": "1.2.3",
        \\    "scale": "kit",
        \\    "requires": [
        \\      { "kind": "secret_ref", "name": "model", "secret_ref": "providers.default.api_key" }
        \\    ],
        \\    "contributes": [
        \\      { "kind": "order_template", "name": "Daily Ops" },
        \\      { "kind": "component", "name": "nullclaw/ops-agent" },
        \\      { "kind": "channel", "name": "telegram.ops" }
        \\    ],
        \\    "config": {
        \\      "secrets": [
        \\        { "name": "model", "secret_ref": "providers.default.api_key" }
        \\      ]
        \\    },
        \\    "seeds": [
        \\      {
        \\        "kind": "order",
        \\        "id": "daily-ops",
        \\        "title": "Daily Ops",
        \\        "summary": "Daily Space operating loop.",
        \\        "order_kind": "loop",
        \\        "status": "active",
        \\        "schedule": "manual",
        \\        "content": "Run the daily ops loop."
        \\      },
        \\      {
        \\        "kind": "instance",
        \\        "component": "nullclaw",
        \\        "name": "ops-agent",
        \\        "version": "dev-local",
        \\        "launch_mode": "managed"
        \\      },
        \\      {
        \\        "kind": "channel",
        \\        "channel_type": "telegram",
        \\        "name": "Ops Telegram",
        \\        "account": "@ops",
        \\        "config": {
        \\          "bot_token": { "secret_ref": "channels.telegram.ops.bot_token" },
        \\          "chat_id": "123"
        \\        }
        \\      }
        \\    ],
        \\    "extends": [],
        \\    "charter": {}
        \\  }
        \\}
    ,
        7000,
    );
    defer allocator.free(resp.body);
    try std.testing.expectEqualStrings("201 Created", resp.status);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"status\":\"installed\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"orders\":1") != null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"instances\":1") != null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"channels\":1") != null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "\"source_tag\":\"market://package/test.full-install@1.2.3#package:test.full-install\"") != null);

    var order = try orders_mod.get(allocator, fixture.paths, "ops", "daily-ops");
    defer order.deinit(allocator);
    try std.testing.expectEqualStrings("active", order.status);
    try std.testing.expectEqualStrings("loop", order.kind);
    try std.testing.expect(std.mem.indexOf(u8, order.content, "nullhub-package-source") != null);
    try std.testing.expect(std.mem.indexOf(u8, order.content, "test.full-install") != null);

    const instance = state.getInstance("nullclaw", "ops-agent") orelse return error.TestExpectedEqual;
    try std.testing.expectEqualStrings("ops", instance.space_id);
    try std.testing.expectEqualStrings("market://package/test.full-install@1.2.3#instance:ops-agent", instance.source_path);

    const channels = state.savedChannels();
    try std.testing.expectEqual(@as(usize, 1), channels.len);
    try std.testing.expectEqualStrings("ops", channels[0].space_id);
    try std.testing.expect(std.mem.indexOf(u8, channels[0].config, "\"secret_ref\":\"channels.telegram.ops.bot_token\"") != null);

    const manifest_path = try fixture.paths.spacePackageLibraryManifest(allocator, "ops", "test.full-install");
    defer allocator.free(manifest_path);
    const manifest = try std_compat.fs.readFileAbsolute(allocator, manifest_path, max_manifest_bytes);
    defer allocator.free(manifest);
    try std.testing.expect(std.mem.indexOf(u8, manifest, "\"id\":\"test.full-install\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, manifest, "literal-secret") == null);

    const events = state.eventsList();
    try std.testing.expectEqual(@as(usize, 1), events.len);
    try std.testing.expectEqualStrings("package.installed", events[0].event_type);
    try std.testing.expectEqualStrings("package", events[0].subject_type);
    try std.testing.expectEqualStrings("test.full-install", events[0].subject_id);
    try std.testing.expect(std.mem.indexOf(u8, events[0].payload_json, "market://package/test.full-install@1.2.3#package:test.full-install") != null);
}

test "market install rolls back partial seed failure" {
    const allocator = std.testing.allocator;
    var fixture = try @import("../test_helpers.zig").TempPaths.init(allocator);
    defer fixture.deinit();
    const state_path = try fixture.paths.state(allocator);
    defer allocator.free(state_path);
    var state = state_mod.State.init(allocator, state_path);
    defer state.deinit();

    const resp = handleInstall(
        allocator,
        fixture.paths,
        &state,
        "/api/market/install?space=ops",
        \\{
        \\  "manifest": {
        \\    "id": "test.rollback-install",
        \\    "name": "Rollback Install",
        \\    "version": "1.0.0",
        \\    "scale": "kit",
        \\    "requires": [],
        \\    "contributes": [],
        \\    "config": {},
        \\    "seeds": [
        \\      { "kind": "order", "id": "created-before-failure", "title": "Created Before Failure", "order_kind": "loop", "content": "Should be rolled back." },
        \\      { "kind": "unsupported_seed", "id": "boom" }
        \\    ],
        \\    "extends": [],
        \\    "charter": {}
        \\  }
        \\}
    ,
        8000,
    );
    try std.testing.expectEqualStrings("422 Unprocessable Entity", resp.status);

    try std.testing.expectError(error.OrderNotFound, orders_mod.get(allocator, fixture.paths, "ops", "created-before-failure"));
    try std.testing.expectEqual(@as(usize, 0), state.eventsList().len);

    const manifest_path = try fixture.paths.spacePackageLibraryManifest(allocator, "ops", "test.rollback-install");
    defer allocator.free(manifest_path);
    try std.testing.expectError(error.FileNotFound, std_compat.fs.readFileAbsolute(allocator, manifest_path, max_manifest_bytes));
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
