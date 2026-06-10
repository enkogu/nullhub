import { encodePathSegment } from '$lib/nullstack/path';

export const SPACE_QUERY_PARAM = 'space';

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

type SpacesListResponse = {
  spaces?: unknown;
};

export function selectedSpaceQuery(spaceId: SpaceSelection | undefined): QueryParams {
  return { [SPACE_QUERY_PARAM]: spaceId || undefined };
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
