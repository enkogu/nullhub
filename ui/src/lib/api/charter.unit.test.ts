import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, charterApi } from './client';
import { ALL_SPACES_STORAGE_VALUE, SELECTED_SPACE_STORAGE_KEY } from './spaces';
import {
  createCharterFixtureRoutes,
  createCharterFixtureState,
  fixtureCharter,
  reservedCharterMarker,
} from './__fixtures__/charter';
import { installApiFixture, type InstalledApiFixture } from './__fixtures__/backend';

let fixture: InstalledApiFixture | null = null;
const originalLocalStorage = globalThis.localStorage;

function installSelectedSpace(spaceId: string | null) {
  const value = spaceId === null ? ALL_SPACES_STORAGE_VALUE : spaceId;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => (key === SELECTED_SPACE_STORAGE_KEY ? value : null)),
    },
  });
}

afterEach(() => {
  fixture?.restore();
  fixture = null;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
});

describe('charter API client', () => {
  test('loads the selected Space charter and normalizes backend wire fields', async () => {
    installSelectedSpace('ops');
    fixture = installApiFixture(createCharterFixtureRoutes());

    const charter = await charterApi.getCharter();

    expect(charter).toEqual(fixtureCharter);
    expect(fixture.requests.map((request) => request.path)).toEqual(['/api/charter?space=ops']);
  });

  test('updates the charter with backend field names and returns the saved copy', async () => {
    const state = createCharterFixtureState([]);
    fixture = installApiFixture(createCharterFixtureRoutes(state));

    const saved = await api.updateCharter({
      spaceId: 'lab',
      stage: 'active',
      mission: 'Keep lab experiments reviewed.',
      autonomyBounds: 'Ask before external spend.',
      autonomyDefaults: 'T1',
      metrics: 'green checks',
    });

    expect(saved).toEqual({
      spaceId: 'lab',
      stage: 'active',
      mission: 'Keep lab experiments reviewed.',
      autonomyBounds: 'Ask before external spend.',
      autonomyDefaults: 'T1',
      metrics: 'green checks',
      docPath: 'charter.md',
    });
    expect(fixture.requests.map(({ method, path, bodyJson }) => ({ method, path, body: bodyJson }))).toEqual([
      {
        method: 'PUT',
        path: '/api/charter?space=lab',
        body: {
          stage: 'active',
          mission: 'Keep lab experiments reviewed.',
          autonomy_bounds: 'Ask before external spend.',
          autonomy_defaults: 'T1',
          metrics: 'green checks',
        },
      },
    ]);
  });

  test('surfaces backend marker collision validation', async () => {
    fixture = installApiFixture(createCharterFixtureRoutes());

    await expect(
      charterApi.updateCharter({
        spaceId: 'ops',
        stage: 'alpha',
        mission: `Bad ${reservedCharterMarker}`,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'charter Markdown fields must not contain reserved NULLHUB charter markers',
    });
  });

  test('rejects reads without a concrete selected space before fetching', async () => {
    installSelectedSpace(null);
    fixture = installApiFixture(createCharterFixtureRoutes());

    await expect(charterApi.getCharter()).rejects.toThrow('Charter API requires a selected Space.');
    expect(fixture.requests).toEqual([]);
  });
});
