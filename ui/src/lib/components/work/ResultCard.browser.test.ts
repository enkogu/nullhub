import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ResultCard from './ResultCard.svelte';
import type { WorkResult } from './results';

const nowMs = 1_780_000_000_000;

const appResult: WorkResult = {
  id: 'artifact:artifact-app-1',
  source: 'artifact',
  type: 'app',
  title: 'Support Portal',
  summary: 'The support portal app produced by the onboarding loop.',
  lifecycle: 'delivered',
  producedAtMs: nowMs - 30 * 60_000,
  app: { component: 'nullclaw', name: 'support-portal' },
  evidenceRef: 'run:loop-run-7',
};

const linkResult: WorkResult = {
  id: 'artifact:artifact-link-1',
  source: 'artifact',
  type: 'link',
  title: 'Published landing page',
  summary: 'Approved landing page ready for the delivery handoff.',
  lifecycle: 'approved',
  producedAtMs: nowMs - 60 * 60_000,
  href: 'https://example.com/landing',
};

const draftResult: WorkResult = {
  id: 'deliverable:task-draft-1',
  source: 'deliverable',
  type: 'document',
  title: 'Outreach email draft',
  summary: 'The drafting loop is still iterating on this email.',
  lifecycle: 'draft',
  producedAtMs: nowMs - 10 * 60_000,
};

test('renders title, lifecycle badge, and source/type chips', async () => {
  const screen = await render(ResultCard, { props: { result: appResult, spaceId: 'ops', nowMs } });

  await expect.element(screen.getByRole('heading', { name: 'Support Portal' })).toBeVisible();
  await expect.element(screen.getByText('Delivered', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('Run artifact')).toBeVisible();
  await expect.element(screen.getByText('App', { exact: true })).toBeVisible();
  await expect.element(screen.getByText('run:loop-run-7')).toBeVisible();
});

test('app results open their app instance scoped to the space', async () => {
  const screen = await render(ResultCard, { props: { result: appResult, spaceId: 'ops', nowMs } });

  const link = screen.container.querySelector<HTMLAnchorElement>('a[aria-label="Open app Support Portal"]');
  expect(link?.getAttribute('href')).toBe('/team/instances/nullclaw/support-portal?space=ops');
  await expect.element(screen.getByText('Open app')).toBeVisible();
});

test('non-app results open via their href', async () => {
  const screen = await render(ResultCard, { props: { result: linkResult, nowMs } });

  const link = screen.container.querySelector<HTMLAnchorElement>('a[aria-label="Open Published landing page"]');
  expect(link?.getAttribute('href')).toBe('https://example.com/landing');
  await expect.element(screen.getByText('Open', { exact: true })).toBeVisible();
});

test('results without links render no open action', async () => {
  const screen = await render(ResultCard, { props: { result: draftResult, nowMs } });

  await expect.element(screen.getByRole('heading', { name: 'Outreach email draft' })).toBeVisible();
  await expect.element(screen.getByText('Draft', { exact: true })).toBeVisible();
  expect(screen.container.querySelector('a')).toBeNull();
});
