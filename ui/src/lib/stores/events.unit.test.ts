import { describe, expect, test, vi } from 'vitest';
import { EventsStore } from '$lib/stores/events.svelte';
import type { EventsApi, EventListPage } from '$lib/api/client';

function eventPage(id: number, nextCursor: string | null = null): EventListPage {
  return {
    events: [
      {
        id,
        spaceId: 'ops',
        type: `work.${id}`,
        source: 'test',
        subjectType: 'run',
        subjectId: `run-${id}`,
        title: `Event ${id}`,
        summary: '',
        severity: 'info',
        evidenceRef: '',
        createdAtMs: id * 1000,
        payload: {},
      },
    ],
    hasMore: Boolean(nextCursor),
    nextCursor,
  };
}

function createEventsApi(pages: EventListPage[]): EventsApi {
  let index = 0;
  return {
    listEvents: vi.fn(async () => pages[Math.min(index++, pages.length - 1)]),
    createEvent: vi.fn(),
  };
}

describe('events store', () => {
  test('loads a shared page of events and appends cursor pages', async () => {
    const api = createEventsApi([eventPage(2, '2'), eventPage(1)]);
    const store = new EventsStore({ api });

    await expect(store.load({ spaceId: 'ops', limit: 1 })).resolves.toMatchObject({ nextCursor: '2' });
    expect(store.status).toBe('ready');
    expect(store.events.map((event) => event.id)).toEqual([2]);
    expect(store.hasMore).toBe(true);

    await expect(store.loadNextPage()).resolves.toMatchObject({ nextCursor: null });
    expect(store.events.map((event) => event.id)).toEqual([2, 1]);
    expect(store.hasMore).toBe(false);
    expect(api.listEvents).toHaveBeenNthCalledWith(1, { spaceId: 'ops', limit: 1 });
    expect(api.listEvents).toHaveBeenNthCalledWith(2, { spaceId: 'ops', limit: 1, cursor: '2' });
  });

  test('surfaces load errors without clearing the previous event page', async () => {
    const api = createEventsApi([eventPage(1)]);
    vi.mocked(api.listEvents).mockRejectedValueOnce(new Error('backend unavailable'));
    const store = new EventsStore({ api });
    store.events = eventPage(9).events;

    await expect(store.load({ spaceId: 'ops' })).rejects.toThrow('backend unavailable');

    expect(store.status).toBe('error');
    expect(store.error).toBe('backend unavailable');
    expect(store.events.map((event) => event.id)).toEqual([9]);
  });

  test('surfaces cursor errors without clearing the existing event page', async () => {
    const api = createEventsApi([eventPage(1)]);
    vi.mocked(api.listEvents).mockRejectedValueOnce(new Error('page unavailable'));
    const store = new EventsStore({ api });
    store.events = eventPage(9, '2').events;
    store.hasMore = true;
    store.nextCursor = '2';
    store.params = { spaceId: 'ops', limit: 1 };

    await expect(store.loadNextPage()).rejects.toThrow('page unavailable');

    expect(store.status).toBe('error');
    expect(store.error).toBe('page unavailable');
    expect(store.events.map((event) => event.id)).toEqual([9]);
    expect(store.hasMore).toBe(true);
    expect(store.nextCursor).toBe('2');
    expect(api.listEvents).toHaveBeenCalledWith({ spaceId: 'ops', limit: 1, cursor: '2' });
  });

  test('delegates polling to pollWhileVisible and stops the active poller', async () => {
    let pollTick: (() => void | Promise<void>) | null = null;
    const stop = vi.fn();
    const poller = vi.fn((tick: () => void | Promise<void>, intervalMs: number) => {
      pollTick = tick;
      expect(intervalMs).toBe(2500);
      return stop;
    });
    const api = createEventsApi([eventPage(1), eventPage(2)]);
    const store = new EventsStore({ api, poller });

    const stopPolling = store.startPolling({ spaceId: 'ops', limit: 5 }, 2500);
    await vi.waitFor(() => expect(api.listEvents).toHaveBeenCalledTimes(1));

    await pollTick?.();
    expect(api.listEvents).toHaveBeenLastCalledWith({ spaceId: 'ops', limit: 5 });
    expect(store.events.map((event) => event.id)).toEqual([2]);

    stopPolling();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test('treats polling refresh failures as best-effort after recording error state', async () => {
    let pollTick: (() => void | Promise<void>) | null = null;
    const poller = vi.fn((tick: () => void | Promise<void>) => {
      pollTick = tick;
      return vi.fn();
    });
    const api = createEventsApi([eventPage(1)]);
    vi.mocked(api.listEvents).mockRejectedValue(new Error('breaker open'));
    const store = new EventsStore({ api, poller });

    expect(() => store.startPolling({ spaceId: 'ops' }, 2500)).not.toThrow();
    await vi.waitFor(() => expect(store.error).toBe('breaker open'));
    await expect(Promise.resolve(pollTick?.())).resolves.toBeUndefined();

    expect(store.status).toBe('error');
    expect(store.error).toBe('breaker open');
  });
});
