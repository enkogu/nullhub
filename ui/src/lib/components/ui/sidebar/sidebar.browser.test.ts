import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import * as Sidebar from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders provider wrapper expanded state', async () => {
	const screen = await render(Sidebar.Provider, {
		open: true,
		children: htmlSnippet('<nav aria-label="Primary">Home</nav>')
	});

	await expect.element(screen.getByRole('navigation', { name: 'Primary' })).toBeVisible();
	expect(screen.container.querySelector('[data-slot="sidebar-wrapper"]')).not.toBeNull();
});

test('renders menu button active state', async () => {
	const screen = await render(Sidebar.Provider, {
		open: true,
		children: htmlSnippet('<button data-active="true" data-slot="sidebar-menu-button">Work</button>')
	});

	await expect.element(screen.getByRole('button', { name: 'Work' })).toBeVisible();
	expect(screen.container.querySelector('[data-active="true"]')).not.toBeNull();
});
