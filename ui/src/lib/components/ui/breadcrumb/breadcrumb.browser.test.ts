import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import * as Breadcrumb from './index.js';

function htmlSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

test('renders breadcrumb navigation state', async () => {
	const screen = await render(Breadcrumb.Root, {
		children: htmlSnippet('<ol><li><a href="/">Home</a></li><li>Work</li></ol>')
	});

	await expect.element(screen.getByRole('navigation', { name: 'breadcrumb' })).toBeVisible();
	await expect.element(screen.getByText('Work')).toBeVisible();
	expect(screen.container.querySelector('[data-slot="breadcrumb"]')).not.toBeNull();
});

test('renders current page state', async () => {
	const screen = await render(Breadcrumb.Page, {
		children: htmlSnippet('Run evidence')
	});

	const page = screen.getByRole('link', { name: 'Run evidence' });
	await expect.element(page).toBeVisible();
	await expect.element(page).toHaveAttribute('aria-current', 'page');
});
