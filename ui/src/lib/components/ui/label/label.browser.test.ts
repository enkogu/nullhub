import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { Label } from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders label text state', async () => {
	const screen = await render(Label, {
		for: 'order-name',
		children: htmlSnippet('Order name')
	});

	await expect.element(screen.getByText('Order name')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="label"]')?.getAttribute('for')).toBe('order-name');
});

test('renders rich label children state', async () => {
	const screen = await render(Label, {
		children: htmlSnippet('<span>Space name <span aria-hidden="true">*</span></span>')
	});

	await expect.element(screen.getByText('Space name')).toBeVisible();
	await expect.element(screen.getByText('*')).toBeVisible();
});
