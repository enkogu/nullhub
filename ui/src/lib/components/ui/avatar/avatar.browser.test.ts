import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import * as Avatar from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders avatar root with loaded state', async () => {
	const screen = await render(Avatar.Root, {
		loadingStatus: 'loaded',
		class: 'size-10',
		children: htmlSnippet('<span>Agent avatar</span>')
	});

	await expect.element(screen.getByText('Agent avatar')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="avatar"]')).not.toBeNull();
});

test('renders fallback initials state', async () => {
	const screen = await render(Avatar.Fallback, {
		children: htmlSnippet('VS')
	});

	await expect.element(screen.getByText('VS')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="avatar-fallback"]')).not.toBeNull();
});
