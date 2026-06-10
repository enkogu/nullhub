import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import * as Alert from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders the default alert state', async () => {
	const screen = await render(Alert.Root, {
		children: htmlSnippet('<strong>Loop ready</strong><span>Review before launch.</span>')
	});

	await expect.element(screen.getByRole('alert')).toBeVisible();
	await expect.element(screen.getByText('Loop ready')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="alert"]')).not.toBeNull();
});

test('renders the destructive alert state', async () => {
	const screen = await render(Alert.Root, {
		variant: 'destructive',
		children: htmlSnippet('<span>Provider key failed</span>')
	});

	await expect.element(screen.getByRole('alert')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="alert"]')?.className).toContain('text-destructive');
});
