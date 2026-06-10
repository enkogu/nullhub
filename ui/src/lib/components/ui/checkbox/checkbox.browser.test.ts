import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Checkbox } from './index.js';

test('toggles checked state when clicked', async () => {
	const screen = await render(Checkbox, {
		checked: false,
		'aria-label': 'Include evidence'
	});
	const control = screen.getByRole('checkbox', { name: 'Include evidence' });

	await expect.element(control).toHaveAttribute('aria-checked', 'false');
	await control.click();
	await expect.element(control).toHaveAttribute('aria-checked', 'true');
});

test('renders disabled indeterminate state', async () => {
	const screen = await render(Checkbox, {
		checked: false,
		indeterminate: true,
		disabled: true,
		'aria-label': 'Partial evidence'
	});
	const control = screen.getByRole('checkbox', { name: 'Partial evidence' });

	await expect.element(control).toHaveAttribute('aria-checked', 'mixed');
	expect(screen.container.querySelector('button')?.disabled).toBe(true);
});
