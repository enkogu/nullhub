import type { Space } from '$lib/api/spaces';
import { jsonFixture, type ApiFixtureRoute } from './backend';

export const fixtureSpaces: Space[] = [
  { id: 'ops', name: 'Operations', kind: 'workspace', stage: 'active' },
  { id: 'lab', name: 'Lab', kind: 'workspace', stage: 'paused' },
];

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
  ];
}
