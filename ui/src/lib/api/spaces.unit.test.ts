import { afterEach, describe, expect, test } from 'vitest';
import { installApiFixture, type InstalledApiFixture } from '$lib/api/__fixtures__/backend';
import { createSpacesFixtureRoutes, createSpacesFixtureState } from '$lib/api/__fixtures__/spaces';
import { spacesApi } from '$lib/api/client';
import { selectedSpaceQuery } from '$lib/api/spaces';

let fixture: InstalledApiFixture | null = null;

describe('spaces API client', () => {
  afterEach(() => {
    fixture?.restore();
    fixture = null;
  });

  test('lists spaces through the NullHub API contract', async () => {
    fixture = installApiFixture(createSpacesFixtureRoutes());

    await expect(spacesApi.listSpaces()).resolves.toEqual([
      { id: 'ops', name: 'Operations', kind: 'workspace', stage: 'active' },
      { id: 'lab', name: 'Lab', kind: 'workspace', stage: 'paused' },
    ]);
    expect(fixture.requests[0]).toMatchObject({ method: 'GET', path: '/api/spaces' });
  });

  test('creates and updates spaces with JSON payloads', async () => {
    const state = createSpacesFixtureState([]);
    fixture = installApiFixture(createSpacesFixtureRoutes(state));

    const created = await spacesApi.createSpace({ id: 'sales', name: 'Sales', kind: 'team' });
    const updated = await spacesApi.updateSpace('sales', { stage: 'paused' });

    expect(created).toEqual({ id: 'sales', name: 'Sales', kind: 'team', stage: 'active' });
    expect(updated).toEqual({ id: 'sales', name: 'Sales', kind: 'team', stage: 'paused' });
    expect(fixture.requests.map(({ method, path, bodyJson }) => ({ method, path, body: bodyJson }))).toEqual([
      { method: 'POST', path: '/api/spaces', body: { id: 'sales', name: 'Sales', kind: 'team' } },
      { method: 'PATCH', path: '/api/spaces/sales', body: { stage: 'paused' } },
    ]);
  });

  test('exports the selected-space query convention with All mode unscoped', () => {
    expect(selectedSpaceQuery('ops')).toEqual({ space: 'ops' });
    expect(selectedSpaceQuery(null)).toEqual({ space: undefined });
    expect(spacesApi.scopedPath('/providers', { spaceId: 'ops', params: { reveal: true } })).toBe(
      '/providers?reveal=true&space=ops',
    );
    expect(spacesApi.scopedPath('/providers', { spaceId: null, params: { reveal: true } })).toBe('/providers?reveal=true');
  });
});
