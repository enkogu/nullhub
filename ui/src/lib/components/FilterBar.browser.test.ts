import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import FilterBar, { type FilterDefinition } from "./FilterBar.svelte";

const filters: FilterDefinition[] = [
	{
		key: "status",
		label: "Status",
		value: "open",
		options: [
			{ label: "Open", value: "open" },
			{ label: "Ready", value: "ready" },
		],
	},
];

test("renders populated filters and emits changes", async () => {
	const onQueryChange = vi.fn();
	const onFilterChange = vi.fn();
	const screen = await render(FilterBar, {
		query: "approval",
		searchLabel: "Search work",
		filters,
		resultCount: 12,
		onQueryChange,
		onFilterChange,
	});

	const input = screen.container.querySelector<HTMLInputElement>("input");
	const select = screen.container.querySelector<HTMLSelectElement>("select");

	await expect.element(screen.getByRole("textbox", { name: "Search work" })).toBeVisible();
	await expect.element(screen.getByText("12")).toBeVisible();

	input!.value = "review";
	input!.dispatchEvent(new Event("input", { bubbles: true }));
	expect(onQueryChange).toHaveBeenCalledWith("review");

	select!.value = "ready";
	select!.dispatchEvent(new Event("change", { bubbles: true }));
	expect(onFilterChange).toHaveBeenCalledWith("status", "ready");
});

test("renders loading, empty, and error states", async () => {
	const loading = await render(FilterBar, {
		state: "loading",
	});
	expect(loading.container.querySelector('[data-slot="skeleton"]')).not.toBeNull();

	const empty = await render(FilterBar, {
		state: "empty",
	});
	await expect.element(empty.getByText("No filters available")).toBeVisible();

	const error = await render(FilterBar, {
		state: "error",
		errorMessage: "Filter metadata failed.",
	});
	await expect.element(error.getByText("Filter metadata failed.")).toBeVisible();
});
