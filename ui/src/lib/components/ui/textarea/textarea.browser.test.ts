import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Textarea } from './index.js';

test('renders text value state', async () => {
	const screen = await render(Textarea, {
		value: 'Escalate if evidence is missing.',
		'aria-label': 'Order notes'
	});

	const textarea = screen.container.querySelector('textarea');
	expect(textarea?.value).toBe('Escalate if evidence is missing.');
	await expect.element(screen.getByLabelText('Order notes')).toBeVisible();
});

test('renders disabled state', async () => {
	const screen = await render(Textarea, {
		value: 'Managed by blueprint.',
		disabled: true,
		'aria-label': 'Readonly notes'
	});

	const textarea = screen.container.querySelector('textarea');
	expect(textarea?.disabled).toBe(true);
	expect(textarea?.value).toBe('Managed by blueprint.');
});
