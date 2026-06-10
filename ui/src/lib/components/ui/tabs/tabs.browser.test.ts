import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import * as Tabs from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders root with the selected value state', async () => {
	const screen = await render(Tabs.Root, {
		value: 'workflows',
		children: htmlSnippet('<div>Workflow details</div>')
	});

	await expect.element(screen.getByText('Workflow details')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="tabs"]')).not.toBeNull();
});

test('renders tab list state', async () => {
	const screen = await render(Tabs.List, {
		children: htmlSnippet('<div><button role="tab">Loops</button><button role="tab">Workflows</button></div>')
	});

	await expect.element(screen.getByRole('tab', { name: 'Loops' })).toBeVisible();
	await expect.element(screen.getByRole('tab', { name: 'Workflows' })).toBeVisible();
	expect(screen.container.querySelector('[data-slot="tabs-list"]')).not.toBeNull();
});
