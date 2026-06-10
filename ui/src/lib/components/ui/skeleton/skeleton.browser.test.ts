import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Skeleton } from './index.js';

test('renders loading placeholder state', async () => {
	const screen = await render(Skeleton, {
		'aria-label': 'Loading work summary',
		class: 'h-4 w-40'
	});
	const skeleton = screen.container.querySelector('[data-slot="skeleton"]');

	expect(skeleton).not.toBeNull();
	expect(skeleton?.getAttribute('aria-label')).toBe('Loading work summary');
});
