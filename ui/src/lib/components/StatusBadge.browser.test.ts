import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StatusBadge from './StatusBadge.svelte';

test('renders the provided status state', async () => {
  const screen = await render(StatusBadge, { status: 'running' });

  await expect.element(screen.getByText('running')).toBeVisible();
});
