import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { ScrollArea } from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders vertical scroll area content', async () => {
	const screen = await render(ScrollArea, {
		orientation: 'vertical',
		children: htmlSnippet('<div>Inbox sweep</div>')
	});

	await expect.element(screen.getByText('Inbox sweep')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="scroll-area"]')).not.toBeNull();
	expect(screen.container.querySelector('[data-slot="scroll-area-viewport"]')).not.toBeNull();
});

test('renders horizontal scrollbar state', async () => {
	const screen = await render(ScrollArea, {
		orientation: 'horizontal',
		children: htmlSnippet('<div class="w-96">Workflow stages</div>')
	});

	await expect.element(screen.getByText('Workflow stages')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="scroll-area"]')).not.toBeNull();
	expect(screen.container.querySelector('[data-slot="scroll-area-viewport"]')).not.toBeNull();
});
