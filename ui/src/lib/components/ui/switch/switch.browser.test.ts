import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Switch } from './index.js';

test('toggles checked state when clicked', async () => {
	const screen = await render(Switch, {
		checked: false,
		'aria-label': 'Autonomy enabled'
	});
	const control = screen.getByRole('switch', { name: 'Autonomy enabled' });

	await expect.element(control).toHaveAttribute('aria-checked', 'false');
	await control.click();
	await expect.element(control).toHaveAttribute('aria-checked', 'true');
});

test('renders disabled state without toggling', async () => {
	const screen = await render(Switch, {
		checked: false,
		disabled: true,
		'aria-label': 'Locked autonomy'
	});
	const control = screen.getByRole('switch', { name: 'Locked autonomy' });

	await expect.element(control).toHaveAttribute('aria-checked', 'false');
	expect(screen.container.querySelector('button')?.disabled).toBe(true);
});
