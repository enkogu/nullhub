const std = @import("std");
const std_compat = @import("compat");
const build_options = @import("build_options");
const paths_mod = @import("../core/paths.zig");
const helpers = @import("helpers.zig");
const query = @import("query.zig");
const spaces_api = @import("spaces.zig");

const appendEscaped = helpers.appendEscaped;
const max_manifest_bytes: usize = 512 * 1024;

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
    try std.testing.expect(!isCatalogPath("/api/market"));
    try std.testing.expect(!isInstalledPath("/api/market/catalog"));
}
