import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import * as Collapsible from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders open root state with children', async () => {
	const screen = await render(Collapsible.Root, {
		open: true,
		children: htmlSnippet('<section>Advanced evidence settings</section>')
	});

	await expect.element(screen.getByText('Advanced evidence settings')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="collapsible"]')).not.toBeNull();
});

test('renders disabled root state', async () => {
	const screen = await render(Collapsible.Root, {
		disabled: true,
		children: htmlSnippet('<span>Locked settings</span>')
	});

	await expect.element(screen.getByText('Locked settings')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="collapsible"]')).not.toBeNull();
});
