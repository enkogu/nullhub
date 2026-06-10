import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CommandFixture from './command.fixture.svelte';

function nextFrame() {
	return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function getInput(container: ParentNode): HTMLInputElement {
	const input = container.querySelector('input');
	expect(input).not.toBeNull();
	return input as HTMLInputElement;
}

function getSelectedItem(container: ParentNode): HTMLElement {
	const item = container.querySelector<HTMLElement>('[data-slot="command-item"][data-selected]');
	expect(item).not.toBeNull();
	return item as HTMLElement;
}

async function setSearchValue(input: HTMLInputElement, value: string) {
	input.focus();
	input.value = value;
	input.dispatchEvent(
		new InputEvent('input', {
			bubbles: true,
			data: value,
			inputType: 'insertText'
		})
	);
	await nextFrame();
}

async function pressKey(input: HTMLInputElement, key: string) {
	input.dispatchEvent(
		new KeyboardEvent('keydown', {
			bubbles: true,
			cancelable: true,
			key
		})
	);
	await nextFrame();
}

test('filters command items from the search input', async () => {
	const screen = await render(CommandFixture);
	const input = getInput(screen.container);

	await expect.element(screen.getByText('Home')).toBeVisible();
	await setSearchValue(input, 'orders');

	await expect.element(screen.getByText('Orders')).toBeVisible();
	await expect.element(screen.getByText('Open tickets, loops, and workflows.')).toBeVisible();
	expect(screen.container.textContent).not.toContain('Home');
});

test('moves the selected command item with arrow keys', async () => {
	const screen = await render(CommandFixture);
	const input = getInput(screen.container);

	input.focus();
	await pressKey(input, 'ArrowDown');
	const firstSelection = getSelectedItem(screen.container).textContent;

	await pressKey(input, 'ArrowDown');
	const secondSelection = getSelectedItem(screen.container).textContent;

	expect(firstSelection).toBeTruthy();
	expect(secondSelection).toBeTruthy();
	expect(secondSelection).not.toEqual(firstSelection);
});
