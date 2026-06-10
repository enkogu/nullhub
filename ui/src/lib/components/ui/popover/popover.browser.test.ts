import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PopoverFixture from './popover.fixture.svelte';

test('renders open popover content', async () => {
	const screen = await render(PopoverFixture, {
		open: true
	});

	await expect.element(screen.getByRole('button', { name: 'Open order tools' })).toBeVisible();
	expect(document.querySelector('[data-slot="popover-title"]')?.textContent).toContain('Order tools');
	await expect.element(screen.getByText('Review schedule controls before launch.')).toBeVisible();
});

test('renders disabled trigger state', async () => {
	const screen = await render(PopoverFixture, {
		disabled: true
	});

	expect(screen.container.querySelector('button')?.disabled).toBe(true);
});
