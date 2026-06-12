import { encodePathSegment } from '$lib/nullstack/path';

export const SPACE_QUERY_PARAM = 'space';
export const SELECTED_SPACE_STORAGE_KEY = 'nullhub:selected-space';
export const ALL_SPACES_STORAGE_VALUE = '__all__';

export type Space = {
  id: string;
  name: string;
  kind: string;
  stage: string;
};

export type SpaceOverviewUsageWindow = '24h' | '7d' | '30d' | 'all';

export type SpaceOverviewAggregate = {
  spaceId: string;
  pendingCount: number;
  liveCount: number;
  spendUsd: number | null;
};

export type SpaceCreateInput = {
  id?: string;
  name: string;
  kind?: string;
  stage?: string;
};

export type SpaceUpdateInput = {
  name?: string;
  kind?: string;
  stage?: string;
};

export type SpaceSelection = string | null;
export type SpaceScopedOptions = {
  spaceId?: SpaceSelection;
};

type RequestFn = <T>(path: string, options?: RequestInit) => Promise<T>;
type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;
type WithQueryFn = (path: string, params: QueryParams) => string;
type SpaceSelectionStorage = Pick<Storage, 'getItem'>;
type SpaceSelectionLocation = Pick<Location, 'href'>;
type SpaceSelectionContext = {
  storage?: SpaceSelectionStorage | null;
  location?: SpaceSelectionLocation | null;
};

type SpacesListResponse = {
  spaces?: unknown;
};

type ListLikeResponse = {
  approvals?: unknown;
  events?: unknown;
};

type UsageTotals = {
  total_cost_usd?: unknown;
  cost_usd?: unknown;
  spend_usd?: unknown;
  total_spend_usd?: unknown;
  amount_usd?: unknown;
};

type UsagePayload = {
  totals?: UsageTotals;
  by_instance?: UsageTotals[];
  by_model?: UsageTotals[];
};

export function selectedSpaceQuery(spaceId: SpaceSelection | undefined): QueryParams {
  return { [SPACE_QUERY_PARAM]: spaceId || undefined };
}

function browserStorage(): SpaceSelectionStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function browserLocation(): SpaceSelectionLocation | null {
  return typeof window === 'undefined' ? null : window.location;
}

export function selectedSpaceFromLocation(location: SpaceSelectionLocation | null): SpaceSelection | undefined {
  if (!location?.href) return undefined;
  const params = new URL(location.href).searchParams;
  if (!params.has(SPACE_QUERY_PARAM)) return undefined;
  const value = params.get(SPACE_QUERY_PARAM)?.trim() ?? '';
  return value || null;
}

export function selectedSpaceFromStorage(storage: SpaceSelectionStorage | null): SpaceSelection | undefined {
  const value = storage?.getItem(SELECTED_SPACE_STORAGE_KEY)?.trim();
  if (!value) return undefined;
  return value === ALL_SPACES_STORAGE_VALUE ? null : value;
}

export function selectedSpaceFromEnvironment(context: SpaceSelectionContext = {}): SpaceSelection | undefined {
  const location = context.location === undefined ? browserLocation() : context.location;
  const storage = context.storage === undefined ? browserStorage() : context.storage;
  return selectedSpaceFromLocation(location) ?? selectedSpaceFromStorage(storage);
}

export function withSelectedSpaceQuery(
  withQuery: WithQueryFn,
  path: string,
  spaceId: SpaceSelection | undefined,
  params: QueryParams = {},
): string {
  return withQuery(path, { ...params, ...selectedSpaceQuery(spaceId) });
}

function normalizeSpace(raw: any): Space {
  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? ''),
    kind: String(raw?.kind ?? 'workspace'),
    stage: String(raw?.stage ?? 'active'),
  };
}

function normalizeSpaceList(raw: SpacesListResponse | Space[] | null | undefined): Space[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.spaces) ? raw.spaces : [];
  return list.map(normalizeSpace);
}

function countList(raw: ListLikeResponse | unknown[] | null | undefined, key: 'approvals' | 'events'): number {
  if (Array.isArray(raw)) return raw.length;
  const list = raw?.[key];
  return Array.isArray(list) ? list.length : 0;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = numberValue(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function costValue(value: UsageTotals | undefined): number | null {
  if (!value) return null;
  return firstNumber(
    value.total_cost_usd,
    value.cost_usd,
    value.spend_usd,
    value.total_spend_usd,
    value.amount_usd,
  );
}

function aggregateCost(rows: UsageTotals[] | undefined): number | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let total = 0;
  let found = false;
  for (const row of rows) {
    const value = costValue(row);
    if (value === null) continue;
    total += value;
    found = true;
  }
  return found ? total : null;
}

function usageSpend(raw: UsagePayload | null | undefined): number | null {
  return costValue(raw?.totals) ?? aggregateCost(raw?.by_instance) ?? aggregateCost(raw?.by_model);
}

export function createSpacesApi(request: RequestFn, withQuery: WithQueryFn) {
  const api = {
    listSpaces: async (): Promise<Space[]> => normalizeSpaceList(await request<SpacesListResponse>(withQuery('/spaces', {}))),
    createSpace: async (input: SpaceCreateInput): Promise<Space> =>
      normalizeSpace(
        await request<Space>('/spaces', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      ),
    updateSpace: async (spaceId: string, input: SpaceUpdateInput): Promise<Space> =>
      normalizeSpace(
        await request<Space>(`/spaces/${encodePathSegment(spaceId)}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        }),
      ),
    getSpaceOverview: async (
      spaceId: string,
      options: { usageWindow?: SpaceOverviewUsageWindow } = {},
    ): Promise<SpaceOverviewAggregate> => {
      const [approvals, events, usage] = await Promise.all([
        request<ListLikeResponse>(withQuery('/approvals', { space: spaceId, status: 'pending', limit: 100 })),
        request<ListLikeResponse>(withQuery('/events', { space: spaceId, limit: 100 })),
        request<UsagePayload>(withQuery('/usage', { space: spaceId, window: options.usageWindow ?? '7d' })),
      ]);
      return {
        spaceId,
        pendingCount: countList(approvals, 'approvals'),
        liveCount: countList(events, 'events'),
        spendUsd: usageSpend(usage),
      };
    },
    listSpaceOverviews: async (
      options: { usageWindow?: SpaceOverviewUsageWindow } = {},
    ): Promise<{ space: Space; aggregate: SpaceOverviewAggregate }[]> => {
      const spaces = normalizeSpaceList(await request<SpacesListResponse>(withQuery('/spaces', {})));
      const aggregates = await Promise.all(spaces.map((space) => api.getSpaceOverview(space.id, options)));
      return spaces.map((space, index) => ({ space, aggregate: aggregates[index] }));
    },
    scopedPath: (path: string, options?: SpaceScopedOptions & { params?: QueryParams }): string =>
      withSelectedSpaceQuery(withQuery, path, options?.spaceId, options?.params),
  };
  return api;
}

export type SpacesApi = ReturnType<typeof createSpacesApi>;
