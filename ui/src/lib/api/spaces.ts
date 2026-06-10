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

export function createSpacesApi(request: RequestFn, withQuery: WithQueryFn) {
  return {
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
    scopedPath: (path: string, options?: SpaceScopedOptions & { params?: QueryParams }): string =>
      withSelectedSpaceQuery(withQuery, path, options?.spaceId, options?.params),
  };
}

export type SpacesApi = ReturnType<typeof createSpacesApi>;
