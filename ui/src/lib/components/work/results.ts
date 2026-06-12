import type { LoopArtifact, LoopTask } from '$lib/loops/types';
import { shortId, taskTime } from '$lib/loops/data';
import { instanceRoute, withQueryParam } from '$lib/nullstack/path';

export const resultLifecycles = ['draft', 'review', 'approved', 'delivered'] as const;
export type ResultLifecycle = (typeof resultLifecycles)[number];
export type ResultLifecycleTone = 'muted' | 'watch' | 'primary' | 'ok';

export type ResultSourceKind = 'deliverable' | 'artifact';
export type ResultType = 'app' | 'document' | 'file' | 'link';

export type ResultApp = {
  component: string;
  name: string;
};

export type WorkResult = {
  id: string;
  source: ResultSourceKind;
  type: ResultType;
  title: string;
  summary: string;
  lifecycle: ResultLifecycle;
  producedAtMs: number | null;
  href?: string;
  app?: ResultApp;
  evidenceRef?: string;
  raw?: unknown;
};

export type ResultFilters = {
  query?: string;
  lifecycle?: string;
  source?: string;
};

export type ResultFilterOption = {
  label: string;
  value: string;
};

export const resultLifecycleMeta: Record<ResultLifecycle, { label: string; tone: ResultLifecycleTone }> = {
  draft: { label: 'Draft', tone: 'muted' },
  review: { label: 'In review', tone: 'watch' },
  approved: { label: 'Approved', tone: 'primary' },
  delivered: { label: 'Delivered', tone: 'ok' },
};

const reviewStages = new Set(['review', 'in_review', 'needs_review', 'reviewing', 'qa']);
const approvedStages = new Set(['approved', 'accepted', 'signed_off']);
const deliveredStages = new Set(['done', 'completed', 'delivered', 'shipped', 'published']);

function isResultLifecycle(value: string): value is ResultLifecycle {
  return (resultLifecycles as readonly string[]).includes(value);
}

export function taskStageToLifecycle(stage?: string | null): ResultLifecycle {
  const normalized = String(stage || '').trim().toLowerCase();
  if (reviewStages.has(normalized)) return 'review';
  if (approvedStages.has(normalized)) return 'approved';
  if (deliveredStages.has(normalized)) return 'delivered';
  return 'draft';
}

function lifecycleFromMeta(...values: unknown[]): ResultLifecycle | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim().toLowerCase();
    if (isResultLifecycle(normalized)) return normalized;
  }
  return null;
}

function appFrom(value: unknown): ResultApp | undefined {
  if (typeof value === 'string') {
    const [component, name] = value.split('/').map((part) => part.trim());
    if (component && name) return { component, name };
    return undefined;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const component = typeof record.component === 'string' ? record.component.trim() : '';
    const name =
      typeof record.name === 'string' && record.name.trim()
        ? record.name.trim()
        : typeof record.instance === 'string'
          ? record.instance.trim()
          : '';
    if (component && name) return { component, name };
  }
  return undefined;
}

function openableHref(uri: string): string | undefined {
  const value = uri.trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return undefined;
}

const documentKinds = new Set(['document', 'doc', 'report', 'markdown', 'md', 'text']);
const linkKinds = new Set(['link', 'url']);

function artifactType(artifact: LoopArtifact): ResultType {
  const kind = String(artifact.kind || '').trim().toLowerCase();
  if (kind === 'app') return 'app';
  if (linkKinds.has(kind)) return 'link';
  if (documentKinds.has(kind)) return 'document';
  return 'file';
}

export function appResultHref(result: WorkResult, spaceId = ''): string | undefined {
  if (!result.app) return undefined;
  return withQueryParam(instanceRoute(result.app.component, result.app.name), 'space', spaceId);
}

export function deliverableToResult(task: LoopTask): WorkResult {
  const metadata = task.metadata || {};
  const app = appFrom(metadata.app);
  const href = typeof metadata.url === 'string' ? openableHref(metadata.url) : undefined;
  return {
    id: `deliverable:${task.id}`,
    source: 'deliverable',
    type: app ? 'app' : href ? 'link' : 'document',
    title: task.title || shortId(task.id),
    summary: task.description || 'Ticket deliverable.',
    lifecycle: lifecycleFromMeta(metadata.lifecycle) ?? taskStageToLifecycle(task.stage),
    producedAtMs: taskTime(task) || null,
    href,
    app,
    evidenceRef: task.latest_run?.id ? `run:${task.latest_run.id}` : undefined,
    raw: task,
  };
}

export function artifactToResult(artifact: LoopArtifact): WorkResult {
  const meta = artifact.meta || {};
  const app = appFrom(meta.app);
  const type = app ? 'app' : artifactType(artifact);
  const title =
    (typeof meta.title === 'string' && meta.title.trim()) || `${artifact.kind || 'Artifact'} ${shortId(artifact.id)}`;
  const summary =
    (typeof meta.summary === 'string' && meta.summary.trim()) ||
    (typeof meta.description === 'string' && meta.description.trim()) ||
    artifact.uri ||
    'Run artifact.';
  return {
    id: `artifact:${artifact.id}`,
    source: 'artifact',
    type,
    title,
    summary,
    lifecycle: lifecycleFromMeta(meta.lifecycle, meta.stage, meta.status) ?? 'draft',
    producedAtMs: artifact.created_at_ms || null,
    href: openableHref(artifact.uri || ''),
    app,
    evidenceRef: artifact.run_id ? `run:${artifact.run_id}` : artifact.task_id ? `task:${artifact.task_id}` : undefined,
    raw: artifact,
  };
}

export function ticketDeliverablesToResults(tasks: LoopTask[]): WorkResult[] {
  return tasks.map(deliverableToResult);
}

export function artifactsToResults(artifacts: LoopArtifact[]): WorkResult[] {
  return artifacts.map(artifactToResult);
}

export function mergeResults(groups: WorkResult[][]): WorkResult[] {
  const seen = new Set<string>();
  const merged: WorkResult[] = [];
  for (const group of groups) {
    for (const result of group) {
      if (seen.has(result.id)) continue;
      seen.add(result.id);
      merged.push(result);
    }
  }
  return merged.sort((a, b) => (b.producedAtMs || 0) - (a.producedAtMs || 0) || a.title.localeCompare(b.title));
}

export function resultSearchText(result: WorkResult): string {
  return [result.title, result.summary, result.source, result.type, result.lifecycle, result.evidenceRef]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function filterResults(results: WorkResult[], filters: ResultFilters = {}): WorkResult[] {
  const query = filters.query?.trim().toLowerCase() ?? '';
  const lifecycle = filters.lifecycle?.trim() ?? '';
  const source = filters.source?.trim() ?? '';
  return results.filter((result) => {
    if (query && !resultSearchText(result).includes(query)) return false;
    if (lifecycle && result.lifecycle !== lifecycle) return false;
    if (source && result.source !== source) return false;
    return true;
  });
}

export function resultSourceLabel(source: ResultSourceKind): string {
  return source === 'deliverable' ? 'Ticket deliverable' : 'Run artifact';
}

export function resultTypeLabel(type: ResultType): string {
  if (type === 'app') return 'App';
  if (type === 'document') return 'Document';
  if (type === 'link') return 'Link';
  return 'File';
}

export function resultLifecycleOptions(results: WorkResult[]): ResultFilterOption[] {
  const present = new Set(results.map((result) => result.lifecycle));
  return resultLifecycles
    .filter((lifecycle) => present.has(lifecycle))
    .map((lifecycle) => ({ value: lifecycle, label: resultLifecycleMeta[lifecycle].label }));
}

export function resultSourceOptions(results: WorkResult[]): ResultFilterOption[] {
  const present = new Set(results.map((result) => result.source));
  return (['deliverable', 'artifact'] as const)
    .filter((source) => present.has(source))
    .map((source) => ({ value: source, label: resultSourceLabel(source) }));
}
