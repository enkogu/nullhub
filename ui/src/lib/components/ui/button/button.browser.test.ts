import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { Button } from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders button variant state', async () => {
	const screen = await render(Button, {
		variant: 'secondary',
		size: 'sm',
		children: htmlSnippet('Deploy agent')
	});

	await expect.element(screen.getByRole('button', { name: 'Deploy agent' })).toBeVisible();
	expect(screen.container.querySelector('[data-slot="button"]')?.className).toContain('h-8');
});

test('renders disabled link state', async () => {
	const screen = await render(Button, {
		href: '/work',
		disabled: true,
		children: htmlSnippet('Open work queue')
	});

	const link = screen.container.querySelector('a');
	await expect.element(screen.getByRole('link', { name: 'Open work queue' })).toBeVisible();
	expect(link?.getAttribute('href')).toBeNull();
	expect(link?.getAttribute('aria-disabled')).toBe('true');
});
