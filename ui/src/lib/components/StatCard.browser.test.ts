import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import StatCard from "./StatCard.svelte";

test("renders populated stat card", async () => {
	const screen = await render(StatCard, {
		title: "Open orders",
		value: 42,
		description: "Across this space.",
		trendCount: 6,
		trendLabel: "ready",
		trendTone: "ok",
	});

	await expect.element(screen.getByText("Open orders")).toBeVisible();
	await expect.element(screen.getByText("42")).toBeVisible();
	await expect.element(screen.getByText("ready")).toBeVisible();
});

test("renders loading and error states", async () => {
	const loading = await render(StatCard, {
		title: "Open orders",
		state: "loading",
	});

	expect(loading.container.querySelector('[data-slot="skeleton"]')).not.toBeNull();

	const error = await render(StatCard, {
		title: "Open orders",
		state: "error",
		errorMessage: "Orders aggregate failed.",
	});

	await expect.element(error.getByText("Orders aggregate failed.")).toBeVisible();
});
