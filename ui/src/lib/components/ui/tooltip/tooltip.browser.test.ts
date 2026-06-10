import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import * as Tooltip from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders provider children state', async () => {
	const screen = await render(Tooltip.Provider, {
		delayDuration: 0,
		children: htmlSnippet('<button type="button">Evidence rule</button>')
	});

	await expect.element(screen.getByRole('button', { name: 'Evidence rule' })).toBeVisible();
});

test('renders provider with configured skip delay state', async () => {
	const screen = await render(Tooltip.Provider, {
		delayDuration: 0,
		skipDelayDuration: 300,
		children: htmlSnippet('<button type="button">Closed tooltip trigger</button>')
	});

	await expect.element(screen.getByRole('button', { name: 'Closed tooltip trigger' })).toBeVisible();
});
