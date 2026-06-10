import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { Select } from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders a selected option state', async () => {
	const screen = await render(Select, {
		value: 'work',
		'aria-label': 'Surface',
		children: htmlSnippet('<option value="work">Work</option>')
	});

	const select = screen.container.querySelector('select');
	expect(select?.value).toBe('work');
	await expect.element(screen.getByRole('combobox', { name: 'Surface' })).toBeVisible();
});

test('renders disabled state', async () => {
	const screen = await render(Select, {
		value: 'orders',
		disabled: true,
		'aria-label': 'Disabled surface',
		children: htmlSnippet('<option value="orders">Orders</option>')
	});

	const select = screen.container.querySelector('select');
	expect(select?.disabled).toBe(true);
	expect(select?.value).toBe('orders');
});
