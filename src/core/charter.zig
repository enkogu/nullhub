const std = @import("std");
const std_compat = @import("compat");
const durable_file = @import("durable_file.zig");
const paths_mod = @import("paths.zig");
const test_helpers = @import("../test_helpers.zig");

pub const default_stage = "draft";
pub const default_autonomy_defaults = "T1";
pub const charter_doc_path = "charter.md";
const max_charter_bytes: usize = 512 * 1024;

pub const Charter = struct {
    space_id: []const u8,
    stage: []const u8,
    mission: []const u8,
    autonomy_bounds: []const u8,
    autonomy_defaults: []const u8,
    metrics: []const u8,
    doc_path: []const u8 = charter_doc_path,

    pub fn deinit(self: Charter, allocator: std.mem.Allocator) void {
        allocator.free(self.space_id);
        allocator.free(self.stage);
        allocator.free(self.mission);
        allocator.free(self.autonomy_bounds);
        allocator.free(self.autonomy_defaults);
        allocator.free(self.metrics);
        allocator.free(self.doc_path);
    }
};

pub const CharterInput = struct {
    stage: []const u8 = default_stage,
    mission: []const u8 = "",
    autonomy_bounds: []const u8 = "",
    autonomy_defaults: []const u8 = default_autonomy_defaults,
    metrics: []const u8 = "",
};

pub fn loadOrDefault(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8) !Charter {
    const doc_path = try paths.spaceCharterDoc(allocator, space_id);
    defer allocator.free(doc_path);

    const bytes = std_compat.fs.readFileAbsolute(allocator, doc_path, max_charter_bytes) catch |err| switch (err) {
        error.FileNotFound => return defaultCharter(allocator, space_id),
        else => return err,
    };
    defer allocator.free(bytes);

    return parseMarkdown(allocator, space_id, bytes);
}

pub fn put(allocator: std.mem.Allocator, paths: paths_mod.Paths, space_id: []const u8, input: CharterInput) !Charter {
    var owned = try ownedCharter(allocator, .{
        .space_id = space_id,
        .stage = normalizedOrDefault(input.stage, default_stage),
        .mission = std.mem.trim(u8, input.mission, " \t\r\n"),
        .autonomy_bounds = std.mem.trim(u8, input.autonomy_bounds, " \t\r\n"),
        .autonomy_defaults = normalizedOrDefault(input.autonomy_defaults, default_autonomy_defaults),
        .metrics = std.mem.trim(u8, input.metrics, " \t\r\n"),
        .doc_path = charter_doc_path,
    });
    errdefer owned.deinit(allocator);

    const doc_path = try paths.spaceCharterDoc(allocator, space_id);
    defer allocator.free(doc_path);
    const dir_path = std.fs.path.dirname(doc_path) orelse return error.InvalidPath;
    try std_compat.fs.makePathAbsolute(dir_path);

    const markdown = try renderMarkdown(allocator, owned);
    defer allocator.free(markdown);
    try writeFileAtomically(allocator, doc_path, markdown);

    return owned;
}

pub fn renderMarkdown(allocator: std.mem.Allocator, charter: Charter) ![]const u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();

    try buf.appendSlice("---\n");
    try appendFrontmatterLine(&buf, "space_id", charter.space_id);
    try appendFrontmatterLine(&buf, "stage", charter.stage);
    try appendFrontmatterLine(&buf, "doc_path", charter.doc_path);
    try buf.appendSlice("---\n");
    try buf.appendSlice("# Space Charter\n\n");
    try appendSection(&buf, "Mission", charter.mission);
    try appendSection(&buf, "Autonomy Bounds", charter.autonomy_bounds);
    try appendSection(&buf, "Autonomy Defaults", charter.autonomy_defaults);
    try appendSection(&buf, "Metrics", charter.metrics);
    return buf.toOwnedSlice();
}

pub fn parseMarkdown(allocator: std.mem.Allocator, expected_space_id: []const u8, bytes: []const u8) !Charter {
    var stage: []const u8 = default_stage;
    var doc_path: []const u8 = charter_doc_path;
    var body = bytes;

    if (std.mem.startsWith(u8, bytes, "---\n")) {
        const end = std.mem.indexOf(u8, bytes[4..], "\n---\n") orelse return error.InvalidCharter;
        const frontmatter = bytes[4 .. 4 + end];
        body = bytes[4 + end + "\n---\n".len ..];

        var lines = std.mem.splitScalar(u8, frontmatter, '\n');
        while (lines.next()) |raw_line| {
            const line = std.mem.trim(u8, raw_line, " \r\t");
            if (line.len == 0) continue;
            const sep = std.mem.indexOfScalar(u8, line, ':') orelse continue;
            const key = std.mem.trim(u8, line[0..sep], " \r\t");
            const value = std.mem.trim(u8, line[sep + 1 ..], " \r\t");
            if (std.mem.eql(u8, key, "stage")) stage = value;
            if (std.mem.eql(u8, key, "doc_path")) doc_path = value;
        }
    }

    const parsed_stage = try parseFrontmatterScalarAlloc(allocator, stage);
    defer allocator.free(parsed_stage);
    const parsed_doc_path = try parseFrontmatterScalarAlloc(allocator, doc_path);
    defer allocator.free(parsed_doc_path);

    return ownedCharter(allocator, .{
        .space_id = expected_space_id,
        .stage = normalizedOrDefault(parsed_stage, default_stage),
        .mission = std.mem.trim(u8, sectionBody(body, "Mission"), " \t\r\n"),
        .autonomy_bounds = std.mem.trim(u8, sectionBody(body, "Autonomy Bounds"), " \t\r\n"),
        .autonomy_defaults = normalizedOrDefault(sectionBody(body, "Autonomy Defaults"), default_autonomy_defaults),
        .metrics = std.mem.trim(u8, sectionBody(body, "Metrics"), " \t\r\n"),
        .doc_path = if (parsed_doc_path.len > 0) parsed_doc_path else charter_doc_path,
    });
}

fn defaultCharter(allocator: std.mem.Allocator, space_id: []const u8) !Charter {
    return ownedCharter(allocator, .{
        .space_id = space_id,
        .stage = default_stage,
        .mission = "",
        .autonomy_bounds = "",
        .autonomy_defaults = default_autonomy_defaults,
        .metrics = "",
        .doc_path = charter_doc_path,
    });
}

fn ownedCharter(allocator: std.mem.Allocator, charter: Charter) !Charter {
    return .{
        .space_id = try allocator.dupe(u8, charter.space_id),
        .stage = try allocator.dupe(u8, charter.stage),
        .mission = try allocator.dupe(u8, charter.mission),
        .autonomy_bounds = try allocator.dupe(u8, charter.autonomy_bounds),
        .autonomy_defaults = try allocator.dupe(u8, charter.autonomy_defaults),
        .metrics = try allocator.dupe(u8, charter.metrics),
        .doc_path = try allocator.dupe(u8, charter.doc_path),
    };
}

fn normalizedOrDefault(value: []const u8, default_value: []const u8) []const u8 {
    const trimmed = std.mem.trim(u8, value, " \t\r\n");
    return if (trimmed.len > 0) trimmed else default_value;
}

fn appendSection(buf: *std.array_list.Managed(u8), title: []const u8, value: []const u8) !void {
    try buf.appendSlice("## ");
    try buf.appendSlice(title);
    try buf.appendSlice("\n");
    if (value.len > 0) {
        try buf.appendSlice(value);
        if (!std.mem.endsWith(u8, value, "\n")) try buf.append('\n');
    }
    try buf.append('\n');
}

fn sectionBody(body: []const u8, wanted_title: []const u8) []const u8 {
    var lines = std.mem.splitScalar(u8, body, '\n');
    var offset: usize = 0;
    var section_start: ?usize = null;
    while (lines.next()) |line| {
        const line_start = offset;
        offset += line.len + if (offset + line.len < body.len) @as(usize, 1) else @as(usize, 0);
        const title = markdownHeadingTitle(line) orelse continue;
        if (section_start) |start| {
            return body[start..line_start];
        }
        if (std.ascii.eqlIgnoreCase(title, wanted_title)) {
            section_start = offset;
        }
    }
    if (section_start) |start| return body[start..];
    return "";
}

fn markdownHeadingTitle(line: []const u8) ?[]const u8 {
    const trimmed = std_compat.mem.trimLeft(u8, line, " \t");
    if (!std.mem.startsWith(u8, trimmed, "## ")) return null;
    if (std.mem.startsWith(u8, trimmed, "### ")) return null;
    return std.mem.trim(u8, trimmed[3..], " \t\r");
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

fn parseFrontmatterScalarAlloc(allocator: std.mem.Allocator, raw_value: []const u8) ![]u8 {
    const trimmed = std.mem.trim(u8, raw_value, " \r\t");
    if (trimmed.len >= 2 and trimmed[0] == '"' and trimmed[trimmed.len - 1] == '"') {
        return parseEscapedDoubleQuotedScalarAlloc(allocator, trimmed[1 .. trimmed.len - 1]);
    }
    return allocator.dupe(u8, trimmed);
}

fn parseEscapedDoubleQuotedScalarAlloc(allocator: std.mem.Allocator, value: []const u8) ![]u8 {
    var buf = std.array_list.Managed(u8).init(allocator);
    errdefer buf.deinit();

    var idx: usize = 0;
    while (idx < value.len) : (idx += 1) {
        const byte = value[idx];
        if (byte != '\\') {
            try buf.append(byte);
            continue;
        }
        idx += 1;
        if (idx >= value.len) break;
        try buf.append(switch (value[idx]) {
            '"' => '"',
            '\\' => '\\',
            'n' => '\n',
            'r' => '\r',
            't' => '\t',
            else => value[idx],
        });
    }

    return buf.toOwnedSlice();
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

test "charter stores per-space markdown with stage and autonomy defaults" {
    const allocator = std.testing.allocator;
    var fixture = try test_helpers.TempPaths.init(allocator);
    defer fixture.deinit();

    var saved = try put(allocator, fixture.paths, "ops", .{
        .stage = "alpha",
        .mission = "Keep customer operations moving.",
        .autonomy_bounds = "Ask before refunds.",
        .autonomy_defaults = "T2 for low-risk follow-ups.",
        .metrics = "Response time and blocked approvals.",
    });
    defer saved.deinit(allocator);

    try std.testing.expectEqualStrings("ops", saved.space_id);
    try std.testing.expectEqualStrings("alpha", saved.stage);
    try std.testing.expectEqualStrings("T2 for low-risk follow-ups.", saved.autonomy_defaults);

    const doc_path = try fixture.paths.spaceCharterDoc(allocator, "ops");
    defer allocator.free(doc_path);
    const doc = try std_compat.fs.readFileAbsolute(allocator, doc_path, max_charter_bytes);
    defer allocator.free(doc);
    try std.testing.expect(std.mem.indexOf(u8, doc, "stage: \"alpha\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, doc, "## Autonomy Defaults") != null);

    var loaded = try loadOrDefault(allocator, fixture.paths, "ops");
    defer loaded.deinit(allocator);
    try std.testing.expectEqualStrings("Keep customer operations moving.", loaded.mission);
    try std.testing.expectEqualStrings("Ask before refunds.", loaded.autonomy_bounds);
    try std.testing.expectEqualStrings("Response time and blocked approvals.", loaded.metrics);

    var other = try loadOrDefault(allocator, fixture.paths, "sales");
    defer other.deinit(allocator);
    try std.testing.expectEqualStrings("sales", other.space_id);
    try std.testing.expectEqualStrings(default_stage, other.stage);
    try std.testing.expectEqualStrings(default_autonomy_defaults, other.autonomy_defaults);
    try std.testing.expectEqualStrings("", other.mission);
}

test "charter markdown round-trips escaped frontmatter and sections" {
    const allocator = std.testing.allocator;
    const source = try ownedCharter(allocator, .{
        .space_id = "ops",
        .stage = "alpha \"quoted\"",
        .mission = "Line one\nLine two",
        .autonomy_bounds = "Stay inside tools.",
        .autonomy_defaults = "T1\nEscalate risky work.",
        .metrics = "cycle_time",
        .doc_path = charter_doc_path,
    });
    defer source.deinit(allocator);

    const markdown = try renderMarkdown(allocator, source);
    defer allocator.free(markdown);
    var parsed = try parseMarkdown(allocator, "ops", markdown);
    defer parsed.deinit(allocator);

    try std.testing.expectEqualStrings(source.stage, parsed.stage);
    try std.testing.expectEqualStrings(source.mission, parsed.mission);
    try std.testing.expectEqualStrings(source.autonomy_bounds, parsed.autonomy_bounds);
    try std.testing.expectEqualStrings(source.autonomy_defaults, parsed.autonomy_defaults);
    try std.testing.expectEqualStrings(source.metrics, parsed.metrics);
}
