import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import * as DropdownMenu from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders root children state', async () => {
	const screen = await render(DropdownMenu.Root, {
		open: false,
		children: htmlSnippet('<button type="button">Open menu</button>')
	});

	await expect.element(screen.getByRole('button', { name: 'Open menu' })).toBeVisible();
});

test('renders label and shortcut states', async () => {
	const label = await render(DropdownMenu.Label, {
		inset: true,
		children: htmlSnippet('Work actions')
	});
	const shortcut = await render(DropdownMenu.Shortcut, {
		children: htmlSnippet('⌘C')
	});

	await expect.element(label.getByText('Work actions')).toBeVisible();
	await expect.element(shortcut.getByText('⌘C')).toBeVisible();
	expect(label.container.querySelector('[data-slot="dropdown-menu-label"]')).not.toBeNull();
	expect(shortcut.container.querySelector('[data-slot="dropdown-menu-shortcut"]')).not.toBeNull();
});
