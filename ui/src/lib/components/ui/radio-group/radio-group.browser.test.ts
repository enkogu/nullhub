import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RadioGroupFixture from './radio-group.fixture.svelte';

test('renders selected radio state', async () => {
	const screen = await render(RadioGroupFixture, {
		value: 'workflows'
	});

	await expect.element(screen.getByRole('radio', { name: 'Workflows' })).toHaveAttribute('aria-checked', 'true');
	await expect.element(screen.getByRole('radio', { name: 'Loops' })).toHaveAttribute('aria-checked', 'false');
});

test('renders disabled radio group state', async () => {
	const screen = await render(RadioGroupFixture, {
		disabled: true
	});

	expect(screen.container.querySelector('button')?.disabled).toBe(true);
});
