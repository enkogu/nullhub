import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ResultLifecycleBadge from './ResultLifecycleBadge.svelte';

test('renders one badge per lifecycle with its tone class', async () => {
  const cases = [
    { lifecycle: 'draft', label: 'Draft', toneClass: 'text-muted-foreground' },
    { lifecycle: 'review', label: 'In review', toneClass: 'text-watch' },
    { lifecycle: 'approved', label: 'Approved', toneClass: 'text-primary' },
    { lifecycle: 'delivered', label: 'Delivered', toneClass: 'text-ok' },
  ] as const;

  for (const { lifecycle, label, toneClass } of cases) {
    const screen = await render(ResultLifecycleBadge, { props: { lifecycle } });
    await expect.element(screen.getByText(label)).toBeVisible();
    const badge = screen.container.querySelector('[data-slot="result-lifecycle-badge"]');
    expect(badge?.className).toContain(toneClass);
  }
});
