import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { toast } from 'svelte-sonner';
import { Toaster } from './index.js';

afterEach(() => {
	toast.dismiss();
});

test('renders the toast provider', async () => {
	await render(Toaster, {
		position: 'bottom-right'
	});
	toast.success('Loop installed');

	await vi.waitFor(() => {
		expect(document.querySelector('[data-sonner-toaster]')).not.toBeNull();
		expect(document.querySelector('[data-sonner-toast]')?.textContent).toContain('Loop installed');
	});
});

test('renders rich color toast provider state', async () => {
	await render(Toaster, {
		position: 'top-right',
		richColors: true
	});
	toast.error('Order failed');

	await vi.waitFor(() => {
		expect(document.querySelector('[data-sonner-toaster]')).not.toBeNull();
		expect(document.querySelector('[data-sonner-toast]')).toHaveAttribute('data-rich-colors', 'true');
		expect(document.querySelector('[data-sonner-toast]')?.textContent).toContain('Order failed');
	});
});
