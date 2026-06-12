import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NeedsYouList from './NeedsYouList.svelte';
import { fixtureApproval, inboxFixtureApprovals, inboxFixtureNowMs } from '$lib/components/inbox/fixtures';

const nowMs = inboxFixtureNowMs;

test('shows the three newest pending requests with /inbox deep links', async () => {
  const approvals = [
    ...inboxFixtureApprovals,
    fixtureApproval({ id: 11, title: 'Sign the oldest request', createdAtMs: nowMs - 8 * 60 * 60_000 }),
  ];
  const screen = await render(NeedsYouList, { props: { approvals, state: 'ready', nowMs } });

  await expect.element(screen.getByRole('heading', { name: 'Needs you' })).toBeVisible();
  await expect.element(screen.getByText('Nightly digest run failed')).toBeVisible();
  await expect.element(screen.getByText('Which tone should the newsletter use?')).toBeVisible();
  await expect.element(screen.getByText('Sign the v2 deploy plan')).toBeVisible();
  // Only the 3 newest pending appear; older pending and decided items do not.
  expect(screen.container.textContent).not.toContain('Sign the oldest request');
  expect(screen.container.textContent).not.toContain('Sign the v1 deploy plan');

  const rows = screen.container.querySelectorAll<HTMLAnchorElement>('[data-slot="needs-you-row"]');
  expect(rows).toHaveLength(3);
  for (const row of rows) expect(row.getAttribute('href')).toBe('/inbox');
  await expect.element(screen.getByRole('link', { name: 'Open inbox' })).toBeVisible();
});

test('renders loading, empty, and error states', async () => {
  const loading = await render(NeedsYouList, { props: { approvals: [], state: 'loading', nowMs } });
  await expect.element(loading.getByText('Loading approvals')).toBeVisible();

  const empty = await render(NeedsYouList, { props: { approvals: [], state: 'ready', nowMs } });
  await expect.element(empty.getByText('Nothing needs you')).toBeVisible();

  const error = await render(NeedsYouList, {
    props: { approvals: [], state: 'error', error: new Error('Approvals down.'), nowMs },
  });
  await expect.element(error.getByText('Approvals unavailable')).toBeVisible();
  await expect.element(error.getByText('Approvals down.')).toBeVisible();
});
