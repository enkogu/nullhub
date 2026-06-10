import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { Dialog } from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders open dialog state', async () => {
	const screen = await render(Dialog, {
		open: true,
		title: 'Install kit',
		description: 'Confirm the blast radius.',
		children: htmlSnippet('<p>Review required secrets.</p>')
	});

	await expect.element(screen.getByRole('dialog', { name: 'Install kit' })).toBeVisible();
	await expect.element(screen.getByText('Confirm the blast radius.')).toBeVisible();
	await expect.element(screen.getByText('Review required secrets.')).toBeVisible();
});

test('renders closed dialog state without modal content', async () => {
	const screen = await render(Dialog, {
		open: false,
		title: 'Hidden dialog',
		children: htmlSnippet('<p>Hidden content</p>')
	});

	expect(screen.container.querySelector('[role="dialog"]')).toBeNull();
});
