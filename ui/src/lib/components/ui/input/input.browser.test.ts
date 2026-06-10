import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Input } from './index.js';

test('renders text input value state', async () => {
	const screen = await render(Input, {
		value: 'Daily inbox triage',
		'aria-label': 'Order name'
	});

	const input = screen.container.querySelector('input');
	await expect.element(screen.getByRole('textbox', { name: 'Order name' })).toBeVisible();
	expect(input?.value).toBe('Daily inbox triage');
	expect(input?.dataset.slot).toBe('input');
});

test('renders disabled invalid state', async () => {
	const screen = await render(Input, {
		value: 'not-an-email',
		type: 'email',
		disabled: true,
		'aria-invalid': 'true',
		'aria-label': 'Provider email'
	});

	const input = screen.container.querySelector('input');
	expect(input?.disabled).toBe(true);
	expect(input?.getAttribute('aria-invalid')).toBe('true');
	expect(input?.value).toBe('not-an-email');
});
