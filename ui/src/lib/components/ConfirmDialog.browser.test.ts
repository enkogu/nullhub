import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import ConfirmDialog from "./ConfirmDialog.svelte";

test("renders open dialog and confirms", async () => {
	const onConfirm = vi.fn();
	const screen = await render(ConfirmDialog, {
		open: true,
		title: "Pause order",
		description: "Confirm before pausing this order.",
		confirmLabel: "Pause",
		onConfirm,
	});

	await expect.element(screen.getByRole("dialog", { name: "Pause order" })).toBeVisible();
	await screen.getByRole("button", { name: "Pause" }).click();
	expect(onConfirm).toHaveBeenCalledTimes(1);
	expect(screen.container.querySelector('[role="dialog"]')).toBeNull();
});

test("renders loading state", async () => {
	const screen = await render(ConfirmDialog, {
		open: true,
		title: "Delete blueprint",
		description: "Confirm before deleting this blueprint.",
		confirmLabel: "Delete",
		loading: true,
	});

	await expect.element(screen.getByRole("button", { name: "Working..." })).toBeDisabled();
});
