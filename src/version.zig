const std = @import("std");
const build_options = @import("build_options");
const ui_assets = @import("ui_assets");

pub const string: []const u8 = build_options.version;
pub const git_commit: []const u8 = build_options.git_commit;

/// Version stamp of the embedded UI build (SvelteKit's `_app/version.json`),
/// or null when no UI is embedded. Two binaries with different stamps serve
/// incompatible hashed asset sets — this is how generation skew is diagnosed.
pub fn uiVersion() ?[]const u8 {
    const asset = ui_assets.get("_app/version.json") orelse return null;
    return parseVersionField(asset.bytes);
}

fn parseVersionField(bytes: []const u8) ?[]const u8 {
    const marker = "\"version\":";
    const key_idx = std.mem.indexOf(u8, bytes, marker) orelse return null;
    const after_key = bytes[key_idx + marker.len ..];
    const open_quote = std.mem.indexOfScalar(u8, after_key, '"') orelse return null;
    const value_start = after_key[open_quote + 1 ..];
    const close_quote = std.mem.indexOfScalar(u8, value_start, '"') orelse return null;
    return value_start[0..close_quote];
}

test "parseVersionField extracts SvelteKit version stamp" {
    try std.testing.expectEqualStrings("1749513600000", parseVersionField("{\"version\":\"1749513600000\"}").?);
    try std.testing.expectEqualStrings("abc", parseVersionField("{ \"version\": \"abc\" }").?);
    try std.testing.expect(parseVersionField("{}") == null);
    try std.testing.expect(parseVersionField("{\"version\":42}") == null);
}
