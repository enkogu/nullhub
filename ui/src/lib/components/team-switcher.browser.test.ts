import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createSpacesFixtureRoutes } from '$lib/api/__fixtures__/spaces';
import { installApiFixture, type InstalledApiFixture } from '$lib/api/__fixtures__/backend';
import TeamSwitcher from './team-switcher.svelte';
import type { SpaceOverviewRowModel } from './SpaceOverviewRow.svelte';

let fixture: InstalledApiFixture | null = null;

const rows: SpaceOverviewRowModel[] = [
  {
    space: { id: 'ops', name: 'Operations', kind: 'workspace', stage: 'active' },
    aggregate: { spaceId: 'ops', pendingCount: 2, liveCount: 3, spendUsd: 12.3456 },
  },
  {
    space: { id: 'lab', name: 'Lab', kind: 'workspace', stage: 'paused' },
    aggregate: { spaceId: 'lab', pendingCount: 1, liveCount: 1, spendUsd: 1.25 },
  },
];

afterEach(() => {
  fixture?.restore();
  fixture = null;
});

test('loads All-spaces overview rows through the typed spaces client', async () => {
  fixture = installApiFixture(createSpacesFixtureRoutes());
  const screen = await render(TeamSwitcher, { props: { defaultOpen: true } });

  await expect.element(screen.getByText('All spaces').first()).toBeVisible();
  await expect.element(screen.getByText('Operations')).toBeVisible();
  await expect.element(screen.getByText('Lab')).toBeVisible();
  await expect.element(screen.getByText('$12.35')).toBeVisible();
  await expect.element(screen.getByText('$1.25')).toBeVisible();

  expect(fixture.requests.map((request) => request.path)).toContain('/api/usage?space=ops&window=7d');
  expect(fixture.requests.map((request) => request.path)).toContain('/api/usage?space=lab&window=7d');
});

test('drills down by selecting a Space row and supports returning to All spaces', async () => {
  const onSelectSpace = vi.fn();
  const onSelectAll = vi.fn();
  const screen = await render(TeamSwitcher, {
    props: { rows, state: 'ready', selectedSpaceId: null, defaultOpen: true, onSelectSpace, onSelectAll },
  });

  await screen.getByRole('menuitem', { name: /Operations active 2 pending 3 live \$12\.35 spend/ }).click();
  expect(onSelectSpace).toHaveBeenCalledWith('ops');
  await expect.element(screen.getByText('Operations').first()).toBeVisible();

  await screen.getByRole('button', { name: /Operations 2 pending/ }).click();
  await screen.getByRole('menuitem', { name: /All spaces/ }).click();
  expect(onSelectAll).toHaveBeenCalledTimes(1);
});

test('renders loading, empty, and error states', async () => {
  const loading = await render(TeamSwitcher, { props: { rows: [], state: 'loading', defaultOpen: true } });
  await expect.element(loading.getByText('Loading spaces')).toBeVisible();

  const empty = await render(TeamSwitcher, { props: { rows: [], state: 'ready', defaultOpen: true } });
  await expect.element(empty.getByText('No spaces yet')).toBeVisible();

  const error = await render(TeamSwitcher, {
    props: { rows: [], state: 'error', error: new Error('Spaces down.'), defaultOpen: true },
  });
  await expect.element(error.getByText('Spaces unavailable')).toBeVisible();
  await expect.element(error.getByText('Spaces down.')).toBeVisible();
});
