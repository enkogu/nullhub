import type { LoopTemplate } from "./templates";

export const LOOP_MARKETPLACE_NAMESPACE = "loops.templates";

type RecordValue = Record<string, unknown>;

export function storeEntryKey(entry: unknown, fallbackIndex = 0): string {
  if (typeof entry === "string" && entry.trim()) return entry.trim();
  const record = asRecord(entry);
  return firstText(record?.key, record?.slug, record?.name) || `template-${fallbackIndex + 1}`;
}

export function storeEntryHasInlineValue(entry: unknown): boolean {
  const record = asRecord(entry);
  if (!record) return typeof entry === "object" && entry !== null;
  return (
    "value" in record ||
    Boolean(
      firstText(
        record.slug,
        record.goal,
        record.exitCondition,
        record.exit_condition,
        record.checkInstruction,
        record.check_instruction,
      ) ||
        asRecord(record.definition) ||
        asRecord(record.loop),
    )
  );
}

export function storeEntryValue(entry: unknown): unknown {
  const record = asRecord(entry);
  if (!record) return entry;
  return "value" in record ? record.value : record;
}

export function normalizeLoopTemplate(raw: unknown, key = ""): LoopTemplate | null {
  const record = asRecord(raw);
  if (!record) return null;

  const definition = asRecord(record.definition);
  const loop = asRecord(record.loop) || asRecord(definition?.loop);
  const starter = asRecord(record.starter);
  const firstTransition = Array.isArray(definition?.transitions) ? asRecord(definition.transitions[0]) : null;

  const slug = slugify(firstText(record.slug, loop?.slug, key, record.name));
  if (!slug) return null;

  const name = firstText(record.name, record.title, loop?.name) || titleize(slug);
  const tagline =
    firstText(record.tagline, record.summary, record.description, record.short_description, record.goal, loop?.goal);
  const goal = firstText(record.goal, loop?.goal, tagline);
  const exitCondition =
    firstText(record.exitCondition, record.exit_condition, loop?.exit_condition, record.done_when);
  const checkInstruction =
    firstText(record.checkInstruction, record.check_instruction, record.instructions, firstTransition?.instructions);
  const maxIterations =
    positiveInteger(record.maxIterations, record.max_iterations, loop?.max_iterations, record.iterations) ?? 5;

  if (!tagline || !goal || !exitCondition || !checkInstruction) return null;

  return {
    slug,
    name,
    category: firstText(record.category, loop?.category) || "Remote",
    machine: firstText(record.machine, loop?.machine) || "Loop Machine",
    tagline,
    goal,
    exitCondition,
    checkInstruction,
    maxIterations,
    source: firstText(record.source, loop?.source) || "marketplace",
    starter: {
      title: firstText(starter?.title, record.starter_title, `Start ${name}`),
      description:
        firstText(starter?.description, record.starter_description, record.description, goal) ||
        `Start ${name}.`,
      priority: positiveInteger(starter?.priority, record.starter_priority, record.priority) ?? 50,
    },
  };
}

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function positiveInteger(...values: unknown[]): number | null {
  for (const value of values) {
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(number) && number > 0) return Math.max(1, Math.floor(number));
  }
  return null;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleize(slug: string): string {
  return slug
    .split(/[-_.]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
