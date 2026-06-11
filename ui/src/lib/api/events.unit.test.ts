import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, eventsApi } from './client';
import { ALL_SPACES_STORAGE_VALUE, SELECTED_SPACE_STORAGE_KEY } from './spaces';
import { eventsFixtureRoutes } from './__fixtures__/events';
import { installApiFixture, jsonFixture, type InstalledApiFixture } from './__fixtures__/backend';

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
  vi.useRealTimers();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
});

describe('events API client', () => {
  test('lists newest events with selected space, filters, and cursor metadata', async () => {
    installSelectedSpace('ops');
    fixture = installApiFixture(eventsFixtureRoutes());

    const page = await eventsApi.listEvents({ type: 'work.finished', limit: 25 });

    expect(page).toEqual({
      events: [
        {
          id: 2,
          spaceId: 'ops',
          type: 'work.finished',
          source: 'dispatcher',
          subjectType: 'run',
          subjectId: 'run-2',
          title: 'Run finished',
          summary: 'The run completed.',
          severity: 'success',
          evidenceRef: 'artifact://run-2',
          createdAtMs: 2000,
          payload: { duration_ms: 1200 },
        },
      ],
      hasMore: true,
      nextCursor: '1',
    });
    expect(fixture.requests.map((request) => request.path)).toEqual([
      '/api/events?space=ops&type=work.finished&limit=25',
    ]);
  });

  test('creates events with the selected space in the query and event payload in the body', async () => {
    fixture = installApiFixture(eventsFixtureRoutes());

    const event = await api.createEvent({
      spaceId: 'ops',
      type: 'work.started',
      source: 'dispatcher',
      subjectType: 'run',
      subjectId: 'run-3',
      title: 'Run started',
      payload: { priority: 1 },
    });

    expect(event).toMatchObject({
      id: 3,
      spaceId: 'ops',
      type: 'work.started',
      source: 'dispatcher',
      subjectType: 'run',
      subjectId: 'run-3',
      title: 'Run started',
      payload: { priority: 1 },
    });
    expect(fixture.requests[0].path).toBe('/api/events?space=ops');
    expect(fixture.requests[0].bodyJson).toMatchObject({
      type: 'work.started',
      source: 'dispatcher',
      subject_type: 'run',
      subject_id: 'run-3',
      title: 'Run started',
      payload: { priority: 1 },
    });
  });

  test('rejects event reads without a concrete selected space before fetching', async () => {
    installSelectedSpace(null);
    fixture = installApiFixture(eventsFixtureRoutes());

    await expect(eventsApi.listEvents()).rejects.toThrow('Events API requires a selected Space.');
    expect(fixture.requests).toEqual([]);
  });

  test.each([0, 502, 503, 504])(
    'uses the shared client circuit breaker after repeated transport failures with status %i',
    async (status) => {
      vi.useFakeTimers();
      const spaceId = `ops-${status}`;
      let failures = 0;
      fixture = installApiFixture([
        {
          method: 'GET',
          path: (request) =>
            request.url.pathname === '/api/events' && request.url.searchParams.get('space') === spaceId,
          handler: () => {
            failures += 1;
            if (failures <= 3) {
              if (status === 0) throw new Error('network unavailable');
              return jsonFixture({ error: 'unavailable' }, { status });
            }
            return jsonFixture({ events: [], has_more: false, next_cursor: null });
          },
        },
      ]);

      try {
        await expect(eventsApi.listEvents({ spaceId })).rejects.toMatchObject({ status });
        await expect(eventsApi.listEvents({ spaceId })).rejects.toMatchObject({ status });
        await expect(eventsApi.listEvents({ spaceId })).rejects.toMatchObject({ status });

        await expect(eventsApi.listEvents({ spaceId })).rejects.toMatchObject({
          status: 0,
          body: { circuitOpen: true },
        });
        expect(fixture.requests).toHaveLength(3);

        await vi.advanceTimersByTimeAsync(5000);
        await expect(eventsApi.listEvents({ spaceId })).resolves.toMatchObject({ events: [] });
        expect(fixture.requests).toHaveLength(4);
      } finally {
        await vi.advanceTimersByTimeAsync(30000);
        await eventsApi.listEvents({ spaceId }).catch(() => undefined);
      }
    },
  );
});
