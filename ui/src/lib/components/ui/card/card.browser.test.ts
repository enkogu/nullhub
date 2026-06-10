import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { Card } from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders card content state', async () => {
	const screen = await render(Card, {
		children: htmlSnippet('<div><h3>Work queue</h3><p>3 runs waiting for review</p></div>')
	});

	await expect.element(screen.getByText('Work queue')).toBeVisible();
	await expect.element(screen.getByText('3 runs waiting for review')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="card"]')).not.toBeNull();
});

test('accepts custom class state', async () => {
	const screen = await render(Card, {
		class: 'px-5',
		children: htmlSnippet('<span>Custom spacing</span>')
	});

	await expect.element(screen.getByText('Custom spacing')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="card"]')?.className).toContain('px-5');
});
