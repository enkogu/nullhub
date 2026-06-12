import type { Space } from '$lib/api/spaces';
import { jsonFixture, type ApiFixtureRoute } from './backend';

export const fixtureSpaces: Space[] = [
  { id: 'ops', name: 'Operations', kind: 'workspace', stage: 'active' },
  { id: 'lab', name: 'Lab', kind: 'workspace', stage: 'paused' },
];

const fixtureSpaceAggregates = {
  ops: {
    approvals: [
      { id: 1, space_id: 'ops', status: 'pending' },
      { id: 2, space_id: 'ops', status: 'pending' },
    ],
    events: [
      { id: 10, space_id: 'ops', title: 'Ops run active' },
      { id: 11, space_id: 'ops', title: 'Ops follow-up active' },
      { id: 12, space_id: 'ops', title: 'Ops review active' },
    ],
    usage: {
      totals: { total_cost_usd: 12.3456, total_tokens: 24000, requests: 24 },
      by_instance: [],
      by_model: [],
      timeseries: [],
    },
  },
  lab: {
    approvals: [{ id: 3, space_id: 'lab', status: 'pending' }],
    events: [{ id: 20, space_id: 'lab', title: 'Lab run active' }],
    usage: {
      totals: { spend_usd: 1.25, total_tokens: 5000, requests: 5 },
      by_instance: [],
      by_model: [],
      timeseries: [],
    },
  },
} as const;

export type SpacesFixtureState = {
  spaces: Space[];
};

export function createSpacesFixtureState(initialSpaces: Space[] = fixtureSpaces): SpacesFixtureState {
  return {
    spaces: initialSpaces.map((space) => ({ ...space })),
  };
}

export function createSpacesFixtureRoutes(state: SpacesFixtureState = createSpacesFixtureState()): ApiFixtureRoute[] {
  return [
    {
      method: 'GET',
      path: '/api/spaces',
      handler: () => jsonFixture({ spaces: state.spaces }),
    },
    {
      method: 'POST',
      path: '/api/spaces',
      handler: ({ bodyJson }) => {
        const payload = bodyJson as Partial<Space> | null;
        const name = String(payload?.name ?? '').trim();
        if (!name) return jsonFixture({ error: 'name is required' }, { status: 422 });

        const created = {
          id: String(payload?.id || name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')),
          name,
          kind: String(payload?.kind || 'workspace'),
          stage: String(payload?.stage || 'active'),
        };
        state.spaces.push(created);
        return jsonFixture(created, { status: 201 });
      },
    },
    {
      method: 'PATCH',
      path: /^\/api\/spaces\/[^/?]+$/,
      handler: ({ url, bodyJson }) => {
        const id = decodeURIComponent(url.pathname.split('/').pop() ?? '');
        const index = state.spaces.findIndex((space) => space.id === id);
        if (index < 0) return jsonFixture({ error: 'space not found' }, { status: 404 });

        state.spaces[index] = { ...state.spaces[index], ...(bodyJson as Partial<Space>) };
        return jsonFixture(state.spaces[index]);
      },
    },
    {
      method: 'GET',
      path: (request) => request.url.pathname === '/api/approvals',
      handler: (request) => {
        const space = request.url.searchParams.get('space') as keyof typeof fixtureSpaceAggregates | null;
        const aggregate = space ? fixtureSpaceAggregates[space] : undefined;
        return jsonFixture({
          approvals: aggregate?.approvals ?? [],
          has_more: false,
          next_cursor: null,
        });
      },
    },
    {
      method: 'GET',
      path: (request) => request.url.pathname === '/api/events',
      handler: (request) => {
        const space = request.url.searchParams.get('space') as keyof typeof fixtureSpaceAggregates | null;
        const aggregate = space ? fixtureSpaceAggregates[space] : undefined;
        return jsonFixture({
          events: aggregate?.events ?? [],
          has_more: false,
          next_cursor: null,
        });
      },
    },
    {
      method: 'GET',
      path: (request) => request.url.pathname === '/api/usage',
      handler: (request) => {
        const space = request.url.searchParams.get('space') as keyof typeof fixtureSpaceAggregates | null;
        const aggregate = space ? fixtureSpaceAggregates[space] : undefined;
        return jsonFixture(
          aggregate?.usage ?? {
            totals: { total_tokens: 0, requests: 0 },
            by_instance: [],
            by_model: [],
            timeseries: [],
          },
        );
      },
    },
  ];
}
