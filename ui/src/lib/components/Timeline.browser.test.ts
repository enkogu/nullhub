import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import Timeline, { type TimelineItem } from "./Timeline.svelte";

const items: TimelineItem[] = [
	{
		id: "queued",
		title: "Order queued",
		description: "Waiting for worker capacity.",
		status: "complete",
		timestamp: "2026-06-10T09:00:00Z",
	},
	{
		id: "running",
		title: "Loop running",
		status: "current",
		meta: "work",
	},
];

test("renders timeline items and emits selection", async () => {
	const onSelect = vi.fn();
	const screen = await render(Timeline, {
		items,
		selectedId: "running",
		onSelect,
	});

	await expect.element(screen.getByText("Order queued")).toBeVisible();
	await expect.element(screen.getByText("Loop running")).toBeVisible();
	await screen.getByRole("button", { name: "Order queued" }).click();
	expect(onSelect).toHaveBeenCalledWith(items[0]);
});

test("renders loading, empty, and error states", async () => {
	const loading = await render(Timeline, { state: "loading" });
	expect(loading.container.querySelector('[aria-label="Loading timeline"]')).not.toBeNull();

	const empty = await render(Timeline, { state: "empty" });
	await expect.element(empty.getByText("No timeline events")).toBeVisible();

	const error = await render(Timeline, {
		state: "error",
		errorMessage: "Events failed.",
	});
	await expect.element(error.getByText("Events failed.")).toBeVisible();
});
