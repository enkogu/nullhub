import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SpaceOverviewRow, { type SpaceOverviewRowModel } from './SpaceOverviewRow.svelte';

const row: SpaceOverviewRowModel = {
  space: { id: 'ops', name: 'Operations', kind: 'workspace', stage: 'active' },
  aggregate: { spaceId: 'ops', pendingCount: 4, liveCount: 2, spendUsd: 12.3456 },
};

test('renders aggregate counts and spend for a Space', async () => {
  const screen = await render(SpaceOverviewRow, { props: { row } });

  await expect.element(screen.getByRole('button', { name: 'Select Operations' })).toBeVisible();
  await expect.element(screen.getByText('Operations')).toBeVisible();
  await expect.element(screen.getByText('4')).toBeVisible();
  await expect.element(screen.getByText('2')).toBeVisible();
  await expect.element(screen.getByText('$12.35')).toBeVisible();
});

test('selects the row and renders unavailable spend honestly', async () => {
  const onSelect = vi.fn();
  const screen = await render(SpaceOverviewRow, {
    props: {
      row: { ...row, aggregate: { ...row.aggregate, spendUsd: null } },
      selected: true,
      onSelect,
    },
  });

  const button = screen.getByRole('button', { name: 'Select Operations' });
  expect((await button.element()).getAttribute('aria-current')).toBe('true');
  await expect.element(screen.getByText('Not reported')).toBeVisible();
  await button.click();
  expect(onSelect).toHaveBeenCalledWith('ops');
});
