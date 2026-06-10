import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { PageHeader } from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders title, subtitle, and alignment state', async () => {
	const screen = await render(PageHeader, {
		title: 'Work',
		subtitle: 'Live runs and evidence',
		align: 'start'
	});

	await expect.element(screen.getByText('Work')).toBeVisible();
	await expect.element(screen.getByText('Live runs and evidence')).toBeVisible();
	expect(screen.container.querySelector('[data-align="start"]')).not.toBeNull();
});

test('renders controls and actions snippets', async () => {
	const screen = await render(PageHeader, {
		title: 'Orders',
		controls: htmlSnippet('<label>Surface <select><option>Orders</option></select></label>'),
		actions: htmlSnippet('<button type="button">New order</button>')
	});

	await expect.element(screen.getByText('Surface')).toBeVisible();
	await expect.element(screen.getByRole('button', { name: 'New order' })).toBeVisible();
});
