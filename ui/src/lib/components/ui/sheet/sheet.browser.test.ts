import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import * as Sheet from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders sheet header content state', async () => {
	const screen = await render(Sheet.Header, {
		children: htmlSnippet('<div><h2>Order details</h2><p>Runs every weekday.</p></div>')
	});

	await expect.element(screen.getByText('Order details')).toBeVisible();
	await expect.element(screen.getByText('Runs every weekday.')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="sheet-header"]')).not.toBeNull();
});

test('renders sheet footer action state', async () => {
	const screen = await render(Sheet.Footer, {
		children: htmlSnippet('<button type="button">Save order</button>')
	});

	await expect.element(screen.getByRole('button', { name: 'Save order' })).toBeVisible();
	expect(screen.container.querySelector('[data-slot="sheet-footer"]')).not.toBeNull();
});
