import type { Charter, CharterUpdateInput } from '$lib/api/client';

export type CharterEditorDraft = {
  stage: string;
  mission: string;
  autonomyBounds: string;
  autonomyDefaults: string;
  metrics: string;
};

export const charterStageOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'alpha', label: 'Alpha' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
] as const;

export const reservedCharterMarkerPattern = /NULLHUB:CHARTER_FIELD:/i;

export function charterToDraft(charter: Charter | null | undefined): CharterEditorDraft {
  return {
    stage: charter?.stage || 'draft',
    mission: charter?.mission || '',
    autonomyBounds: charter?.autonomyBounds || '',
    autonomyDefaults: charter?.autonomyDefaults || 'T1',
    metrics: charter?.metrics || '',
  };
}

export function draftToCharterInput(draft: CharterEditorDraft): CharterUpdateInput {
  return {
    stage: draft.stage.trim() || 'draft',
    mission: draft.mission,
    autonomyBounds: draft.autonomyBounds,
    autonomyDefaults: draft.autonomyDefaults.trim() || 'T1',
    metrics: draft.metrics,
  };
}

export function charterHasEditableContent(charter: Charter | null | undefined): boolean {
  if (!charter) return false;
  return Boolean(
    charter.mission.trim() ||
      charter.autonomyBounds.trim() ||
      charter.metrics.trim() ||
      (charter.autonomyDefaults.trim() && charter.autonomyDefaults.trim() !== 'T1'),
  );
}

export function fieldHasReservedCharterMarker(value: string): boolean {
  return reservedCharterMarkerPattern.test(value);
}

export function draftHasReservedCharterMarker(draft: CharterEditorDraft): boolean {
  return (
    fieldHasReservedCharterMarker(draft.mission) ||
    fieldHasReservedCharterMarker(draft.autonomyBounds) ||
    fieldHasReservedCharterMarker(draft.autonomyDefaults) ||
    fieldHasReservedCharterMarker(draft.metrics)
  );
}

export function splitCharterLines(value: string, limit = 3): string[] {
  return value
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function firstCharterLine(value: string, fallback: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0] ?? fallback;
}

export function charterStageLabel(stage: string): string {
  const normalized = stage.trim().toLowerCase();
  const known = charterStageOptions.find((option) => option.value === normalized);
  if (known) return known.label;
  if (!normalized) return 'Draft';
  return normalized[0].toUpperCase() + normalized.slice(1);
}

export function charterStageTone(stage: string): 'default' | 'secondary' | 'outline' | 'warning' | 'muted' {
  const normalized = stage.trim().toLowerCase();
  if (normalized === 'active') return 'default';
  if (normalized === 'alpha') return 'warning';
  if (normalized === 'paused') return 'muted';
  if (normalized === 'draft') return 'outline';
  return 'secondary';
}
