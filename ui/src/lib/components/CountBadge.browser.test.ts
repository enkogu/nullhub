import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import CountBadge from "./CountBadge.svelte";

test("renders formatted count and label", async () => {
	const screen = await render(CountBadge, {
		count: 1280,
		label: "events",
		tone: "primary",
	});

	await expect.element(screen.getByText("1,280")).toBeVisible();
	await expect.element(screen.getByText("events")).toBeVisible();
	expect(screen.container.querySelector('[data-slot="count-badge"]')).not.toBeNull();
});

test("renders loading state", async () => {
	const screen = await render(CountBadge, {
		loading: true,
		label: "orders",
	});

	expect(screen.container.querySelector('[aria-label="Loading orders"] [data-slot="skeleton"]')).not.toBeNull();
});
