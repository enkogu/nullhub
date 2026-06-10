import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import EmptyState from "./EmptyState.svelte";

test("renders empty state with primary action", async () => {
	const onAction = vi.fn();
	const screen = await render(EmptyState, {
		title: "No orders",
		description: "Create an order to begin.",
		actionLabel: "Create order",
		onAction,
	});

	await expect.element(screen.getByText("No orders")).toBeVisible();
	await screen.getByRole("button", { name: "Create order" }).click();
	expect(onAction).toHaveBeenCalledTimes(1);
});

test("renders loading state", async () => {
	const screen = await render(EmptyState, {
		loading: true,
	});

	expect(screen.container.querySelector('[aria-label="Loading empty state"]')).not.toBeNull();
});
