import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Progress } from './index.js';

test('renders progress value state', async () => {
	const screen = await render(Progress, {
		value: 40,
		max: 100,
		'aria-label': 'Workspace image build progress'
	});

	await expect
		.element(screen.getByRole('progressbar', { name: 'Workspace image build progress' }))
		.toHaveAttribute('aria-valuenow', '40');
	expect(screen.container.querySelector('[data-slot="progress-indicator"]')?.getAttribute('style')).toContain(
		'translateX(-60%)'
	);
});

test('renders empty progress state', async () => {
	const screen = await render(Progress, {
		value: 0,
		max: 100,
		'aria-label': 'Workspace image build progress'
	});

	expect(screen.container.querySelector('[data-slot="progress-indicator"]')?.getAttribute('style')).toContain(
		'translateX(-100%)'
	);
});
