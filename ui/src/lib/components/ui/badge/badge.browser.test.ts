import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { Badge } from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders default badge state', async () => {
	const screen = await render(Badge, {
		variant: 'default',
		children: htmlSnippet('Live')
	});

	await expect.element(screen.getByText('Live')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="badge"]')).not.toBeNull();
});

test('renders destructive badge state', async () => {
	const screen = await render(Badge, {
		variant: 'destructive',
		children: htmlSnippet('Failed')
	});

	await expect.element(screen.getByText('Failed')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="badge"]')?.className).toContain('red');
});
