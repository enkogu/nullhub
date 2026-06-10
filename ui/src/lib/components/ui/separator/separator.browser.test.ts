import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Separator } from './index.js';

test('renders horizontal state by default', async () => {
	const screen = await render(Separator);
	const separator = screen.container.querySelector('[data-slot="separator"]');

	expect(separator).not.toBeNull();
	expect(separator?.getAttribute('data-orientation')).toBe('horizontal');
});

test('renders vertical semantic state', async () => {
	const screen = await render(Separator, { orientation: 'vertical', decorative: false });
	const separator = screen.container.querySelector('[role="separator"]');

	expect(separator).not.toBeNull();
	expect(separator?.getAttribute('data-orientation')).toBe('vertical');
	expect(separator?.getAttribute('aria-orientation')).toBe('vertical');
});
