import { describe, expect, test, vi } from 'vitest';
import { NEEDS_YOU_POLL_INTERVAL_MS, NeedsYouStore } from '$lib/stores/needsYou.svelte';
import type { Approval, ApprovalListPage } from '$lib/api/client';

function approval(id: number): Approval {
  return {
    id,
    spaceId: 'ops',
    kind: 'signature',
    queue: '',
    targetRef: '',
    title: `Approval ${id}`,
    summary: '',
    status: 'pending',
    feedback: '',
    createdAtMs: id * 1000,
    decidedAtMs: 0,
  };
}

function page(count: number, hasMore = false): ApprovalListPage {
  return {
    approvals: Array.from({ length: count }, (_, index) => approval(index + 1)),
    hasMore,
    nextCursor: hasMore ? String(count) : null,
  };
}

describe('NeedsYouStore', () => {
  test('refresh derives the pending count from space-scoped pending reads', async () => {
    const listApprovals = vi.fn().mockResolvedValue(page(4));
    const store = new NeedsYouStore({ api: { listApprovals }, poller: () => () => undefined });

    const count = await store.refresh({ spaceId: 'ops' });

    expect(count).toBe(4);
    expect(store.count).toBe(4);
    expect(store.status).toBe('ready');
    expect(store.showBadge).toBe(true);
    expect(store.displayCount).toBe('4');
    expect(listApprovals).toHaveBeenCalledWith({ spaceId: 'ops', status: 'pending', limit: 100 });
  });

  test('zero pending hides the badge', async () => {
    const listApprovals = vi.fn().mockResolvedValue(page(0));
    const store = new NeedsYouStore({ api: { listApprovals }, poller: () => () => undefined });

    await store.refresh({ spaceId: 'ops' });

    expect(store.count).toBe(0);
    expect(store.showBadge).toBe(false);
  });

  test('overflowing pages display 99+', async () => {
    const listApprovals = vi.fn().mockResolvedValue(page(100, true));
    const store = new NeedsYouStore({ api: { listApprovals }, poller: () => () => undefined });

    await store.refresh({ spaceId: 'ops' });

    expect(store.displayCount).toBe('99+');
  });

  test('startPolling refreshes immediately and registers a 30s pollWhileVisible tick', async () => {
    const listApprovals = vi
      .fn()
      .mockResolvedValueOnce(page(1))
      .mockResolvedValueOnce(page(2));
    let registeredInterval = 0;
    let registeredTick: (() => void | Promise<void>) | null = null;
    const stopSpy = vi.fn();
    const store = new NeedsYouStore({
      api: { listApprovals },
      poller: (tick, intervalMs) => {
        registeredTick = tick;
        registeredInterval = intervalMs;
        return stopSpy;
      },
    });

    const stop = store.startPolling({ spaceId: 'ops' });
    await vi.waitFor(() => expect(store.count).toBe(1));
    expect(registeredInterval).toBe(NEEDS_YOU_POLL_INTERVAL_MS);

    // A later tick re-derives the count (e.g. a new approval arrives <=30s).
    await registeredTick!();
    expect(store.count).toBe(2);

    stop();
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  test('refresh failures record the error state without throwing from poll ticks', async () => {
    const listApprovals = vi.fn().mockRejectedValue(new Error('approvals down'));
    let registeredTick: (() => void | Promise<void>) | null = null;
    const store = new NeedsYouStore({
      api: { listApprovals },
      poller: (tick) => {
        registeredTick = tick;
        return () => undefined;
      },
    });

    store.startPolling({ spaceId: 'ops' });
    await vi.waitFor(() => expect(store.status).toBe('error'));
    expect(store.error).toBe('approvals down');

    // Poll ticks never throw.
    await expect(Promise.resolve(registeredTick!())).resolves.toBeUndefined();
  });

  test('uses the shared pollWhileVisible helper by default', () => {
    const store = new NeedsYouStore({ api: { listApprovals: vi.fn() } });
    // pollWhileVisible pauses on hidden tabs; the default wiring is asserted
    // by identity to avoid duplicating its own visibility tests here.
    expect(store.poller.name).toBe('pollWhileVisible');
  });
});
