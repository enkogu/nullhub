import type {
  EntityColumn,
  EntityFieldValue,
  EntityRecord,
  EntityViewAction,
  EntityViewDefinition,
  EntityViewMode,
} from "./types";

export const NOTION_LIKE_ENTITY_VIEWS: EntityViewDefinition[] = [
  { id: "table", label: "Table", mode: "table" },
  { id: "cards", label: "Cards", mode: "cards" },
  { id: "kanban", label: "Board", mode: "kanban", groupBy: "status" },
  { id: "list", label: "List", mode: "list" },
  { id: "split", label: "Split", mode: "split" },
  { id: "timeline", label: "Timeline", mode: "timeline", dateField: "date" },
  { id: "calendar", label: "Calendar", mode: "calendar", dateField: "date" },
  { id: "tree", label: "Tree", mode: "tree" },
  { id: "icons", label: "Icons", mode: "icons" },
];

export function createViewSet(
  overrides: Partial<Record<EntityViewMode, Partial<EntityViewDefinition>>> = {},
): EntityViewDefinition[] {
  return NOTION_LIKE_ENTITY_VIEWS.map((view) => ({
    ...view,
    ...(overrides[view.mode] || {}),
  }));
}

export function fieldValue(record: EntityRecord, columnOrField: EntityColumn | string | undefined): EntityFieldValue {
  if (!columnOrField) return undefined;
  if (typeof columnOrField === "string") return fieldById(record, columnOrField);
  if (typeof columnOrField.accessor === "function") return columnOrField.accessor(record);
  if (typeof columnOrField.accessor === "string") return fieldById(record, columnOrField.accessor);
  return fieldById(record, columnOrField.id);
}

export function fieldById(record: EntityRecord, fieldId: string): EntityFieldValue {
  if (fieldId === "id") return record.id;
  if (fieldId === "title" || fieldId === "name" || fieldId === "label") return record.title;
  if (fieldId === "subtitle") return record.subtitle;
  if (fieldId === "type") return record.type;
  if (fieldId === "status") return record.status;
  if (fieldId === "description") return record.description;
  if (fieldId === "date") return record.date;
  if (fieldId === "start") return record.start;
  if (fieldId === "end") return record.end;
  if (fieldId === "parentId") return record.parentId;
  return record.fields?.[fieldId];
}

export function valueText(value: EntityFieldValue): string {
  if (value === null || value === undefined || value === false) return "";
  if (value === true) return "true";
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function recordSearchText(record: EntityRecord, columns: EntityColumn[] = []): string {
  const values = [
    record.id,
    record.title,
    record.subtitle,
    record.type,
    record.status,
    record.description,
    ...columns.map((column) => valueText(fieldValue(record, column))),
  ];
  return values.filter(Boolean).join(" ").toLowerCase();
}

export function dateMs(value: EntityFieldValue): number | null {
  const text = valueText(value).trim();
  if (!text) return null;
  const parsed = new Date(text).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatDate(value: EntityFieldValue): string {
  const ms = dateMs(value);
  if (ms === null) return valueText(value) || "-";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function statusKind(status: EntityFieldValue): "success" | "warning" | "danger" | "muted" | "default" {
  const normalized = valueText(status).toLowerCase().replace(/[\s-]+/g, "_");
  if (["running", "active", "connected", "success", "done", "closed", "completed", "enabled"].includes(normalized)) return "success";
  if (["starting", "pending", "queued", "in_progress", "progress", "review", "in_review"].includes(normalized)) return "warning";
  if (["failed", "error", "blocked", "stopping", "disabled", "needs_reconnect"].includes(normalized)) return "danger";
  if (["stopped", "unknown", "backlog", "deferred", "canceled", "cancelled"].includes(normalized)) return "muted";
  return "default";
}

export function groupRecords(records: EntityRecord[], fieldId = "status"): Array<{ value: string; label: string; records: EntityRecord[] }> {
  const groups = new Map<string, EntityRecord[]>();
  for (const record of records) {
    const value = valueText(fieldById(record, fieldId)).trim() || "Unassigned";
    groups.set(value, [...(groups.get(value) || []), record]);
  }
  return [...groups.entries()]
    .map(([value, grouped]) => ({ value, label: value, records: grouped }))
    .sort((a, b) => groupRank(a.value) - groupRank(b.value) || a.label.localeCompare(b.label));
}

export function visibleActions(actions: EntityViewAction[] = [], record: EntityRecord): EntityViewAction[] {
  return actions.filter((action) => !action.visible || action.visible(record));
}

export function sortRecords(records: EntityRecord[], fieldId: string, direction: "asc" | "desc"): EntityRecord[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...records].sort((a, b) => compareField(a, b, fieldId) * multiplier || a.title.localeCompare(b.title));
}

export function flattenTree(records: EntityRecord[], parentField = "parentId"): Array<{ record: EntityRecord; depth: number }> {
  const directRoots = records.filter((record) => record.children?.length);
  if (directRoots.length > 0) {
    const out: Array<{ record: EntityRecord; depth: number }> = [];
    for (const record of records) walkNested(record, 0, out);
    return out;
  }

  const byParent = new Map<string, EntityRecord[]>();
  const ids = new Set(records.map((record) => record.id));
  for (const record of records) {
    const parentId = valueText(fieldById(record, parentField)).trim();
    if (parentId && ids.has(parentId)) byParent.set(parentId, [...(byParent.get(parentId) || []), record]);
  }
  const roots = records.filter((record) => {
    const parentId = valueText(fieldById(record, parentField)).trim();
    return !parentId || !ids.has(parentId);
  });
  const out: Array<{ record: EntityRecord; depth: number }> = [];
  const walk = (record: EntityRecord, depth: number) => {
    out.push({ record, depth });
    for (const child of byParent.get(record.id) || []) walk(child, depth + 1);
  };
  for (const record of roots) walk(record, 0);
  return out;
}

function walkNested(record: EntityRecord, depth: number, out: Array<{ record: EntityRecord; depth: number }>) {
  out.push({ record, depth });
  for (const child of record.children || []) walkNested(child, depth + 1, out);
}

function compareField(a: EntityRecord, b: EntityRecord, fieldId: string): number {
  const av = fieldById(a, fieldId);
  const bv = fieldById(b, fieldId);
  const ad = dateMs(av);
  const bd = dateMs(bv);
  if (ad !== null || bd !== null) return (ad ?? 0) - (bd ?? 0);
  if (typeof av === "number" || typeof bv === "number") return Number(av || 0) - Number(bv || 0);
  return valueText(av).localeCompare(valueText(bv), undefined, { numeric: true, sensitivity: "base" });
}

function groupRank(value: string): number {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (["running", "active", "connected", "success"].includes(normalized)) return 0;
  if (["in_review", "review"].includes(normalized)) return 1;
  if (["in_progress", "progress", "starting", "queued", "pending"].includes(normalized)) return 2;
  if (["open", "todo", "default"].includes(normalized)) return 3;
  if (["blocked", "failed", "error"].includes(normalized)) return 4;
  if (["stopped", "disabled", "unknown"].includes(normalized)) return 5;
  if (["done", "closed", "completed"].includes(normalized)) return 6;
  return 20;
}
