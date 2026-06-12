import { selectedSpaceFromEnvironment, type SpaceSelection } from '$lib/api/spaces';

type RequestFn = <T>(path: string, options?: RequestInit) => Promise<T>;
type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;
type WithQueryFn = (path: string, params: QueryParams) => string;

export type Charter = {
  spaceId: string;
  stage: string;
  mission: string;
  autonomyBounds: string;
  autonomyDefaults: string;
  metrics: string;
  docPath: string;
};

export type CharterScopedOptions = {
  spaceId?: SpaceSelection;
};

export type CharterUpdateInput = CharterScopedOptions & {
  stage: string;
  mission?: string;
  autonomyBounds?: string;
  autonomyDefaults?: string;
  metrics?: string;
};

function requireSpaceId(spaceId: SpaceSelection | undefined): string {
  const resolved = spaceId === undefined ? selectedSpaceFromEnvironment() : spaceId;
  if (!resolved) throw new Error('Charter API requires a selected Space.');
  return resolved;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function normalizeCharter(raw: any): Charter {
  return {
    spaceId: stringValue(raw?.space_id ?? raw?.spaceId),
    stage: stringValue(raw?.stage || 'draft'),
    mission: stringValue(raw?.mission),
    autonomyBounds: stringValue(raw?.autonomy_bounds ?? raw?.autonomyBounds),
    autonomyDefaults: stringValue(raw?.autonomy_defaults ?? raw?.autonomyDefaults ?? raw?.defaults ?? 'T1'),
    metrics: stringValue(raw?.metrics),
    docPath: stringValue(raw?.doc_path ?? raw?.docPath ?? 'charter.md'),
  };
}

function charterBody(input: CharterUpdateInput) {
  return {
    stage: input.stage,
    mission: input.mission,
    autonomy_bounds: input.autonomyBounds,
    autonomy_defaults: input.autonomyDefaults,
    metrics: input.metrics,
  };
}

export function createCharterApi(request: RequestFn, withQuery: WithQueryFn) {
  function charterPath(options?: CharterScopedOptions) {
    return withQuery('/charter', { space: requireSpaceId(options?.spaceId) });
  }

  return {
    getCharter: async (options?: CharterScopedOptions): Promise<Charter> =>
      normalizeCharter(await request<any>(charterPath(options))),
    updateCharter: async (input: CharterUpdateInput): Promise<Charter> =>
      normalizeCharter(
        await request<any>(charterPath(input), {
          method: 'PUT',
          body: JSON.stringify(charterBody(input)),
        }),
      ),
  };
}

export type CharterApi = ReturnType<typeof createCharterApi>;
