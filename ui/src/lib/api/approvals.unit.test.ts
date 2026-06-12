import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, approvalsApi } from './client';
import { ALL_SPACES_STORAGE_VALUE, SELECTED_SPACE_STORAGE_KEY } from './spaces';
import { approvalsFixtureRoutes } from './__fixtures__/approvals';
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

describe('approvals API client', () => {
  test('lists approvals space-scoped with status, kind, and queue filters', async () => {
    installSelectedSpace('ops');
    fixture = installApiFixture(approvalsFixtureRoutes());

    const page = await approvalsApi.listApprovals({ status: 'pending', kind: 'signature', limit: 25 });

    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.approvals).toEqual([
      {
        id: 1,
        spaceId: 'ops',
        kind: 'signature',
        queue: 'deploys',
        targetRef: 'order:42',
        title: 'Sign the v2 deploy plan',
        summary: '## Deploy plan\n\n- roll out v2\n- watch error rate',
        status: 'pending',
        feedback: '',
        createdAtMs: 1000,
        decidedAtMs: 0,
      },
    ]);
    expect(fixture.requests.map((request) => request.path)).toEqual([
      '/api/approvals?space=ops&status=pending&kind=signature&limit=25',
    ]);
  });

  test('decides approvals with space query and decision body', async () => {
    fixture = installApiFixture(approvalsFixtureRoutes());

    const approval = await api.decideApproval(1, {
      spaceId: 'ops',
      decision: 'pushed_back',
      feedback: 'Needs a rollback plan first.',
    });

    expect(approval).toMatchObject({
      id: 1,
      status: 'pushed_back',
      feedback: 'Needs a rollback plan first.',
      decidedAtMs: 9000,
    });
    expect(fixture.requests[0].path).toBe('/api/approvals/1/decide?space=ops');
    expect(fixture.requests[0].bodyJson).toEqual({
      decision: 'pushed_back',
      feedback: 'Needs a rollback plan first.',
    });
  });

  test('surfaces feedback-required errors from pushed_back decides', async () => {
    fixture = installApiFixture(approvalsFixtureRoutes());

    await expect(
      approvalsApi.decideApproval(1, { spaceId: 'ops', decision: 'pushed_back', feedback: '' }),
    ).rejects.toMatchObject({ status: 422 });
  });

  test('creates approvals with snake_case body fields', async () => {
    fixture = installApiFixture(approvalsFixtureRoutes());

    const approval = await approvalsApi.createApproval({
      spaceId: 'ops',
      kind: 'signature',
      queue: 'deploys',
      targetRef: 'order:43',
      title: 'Sign the v3 deploy plan',
    });

    expect(approval).toMatchObject({ id: 4, spaceId: 'ops', status: 'pending' });
    expect(fixture.requests[0].path).toBe('/api/approvals?space=ops');
    expect(fixture.requests[0].bodyJson).toMatchObject({
      kind: 'signature',
      queue: 'deploys',
      target_ref: 'order:43',
      title: 'Sign the v3 deploy plan',
    });
  });

  test('rejects approval reads without a concrete selected space before fetching', async () => {
    installSelectedSpace(null);
    fixture = installApiFixture(approvalsFixtureRoutes());

    await expect(approvalsApi.listApprovals()).rejects.toThrow(
      'Approvals API requires a selected Space.',
    );
    expect(fixture.requests).toEqual([]);
  });
});
