import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import * as Kbd from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders a keyboard key', async () => {
	const screen = await render(Kbd.Root, {
		children: htmlSnippet('Esc')
	});

	await expect.element(screen.getByText('Esc')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="kbd"]')?.tagName).toBe('KBD');
});

test('renders a keyboard group', async () => {
	const screen = await render(Kbd.Group, {
		children: htmlSnippet('<span><kbd>Ctrl</kbd><kbd>K</kbd></span>')
	});

	await expect.element(screen.getByText('Ctrl')).toBeVisible();
	await expect.element(screen.getByText('K')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="kbd-group"]')).not.toBeNull();
});
