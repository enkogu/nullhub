import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import EntityChip from "./EntityChip.svelte";

test("renders link routing for entity chip", async () => {
	const screen = await render(EntityChip, {
		label: "Studio Ops",
		kind: "Space",
		href: "/team?space=studio-ops",
		status: "running",
	});

	const link = screen.container.querySelector<HTMLAnchorElement>("a");
	await expect.element(screen.getByRole("link", { name: "Studio Ops" })).toBeVisible();
	expect(link?.getAttribute("href")).toBe("/team?space=studio-ops");
});

test("calls select handler for button chip", async () => {
	const onSelect = vi.fn();
	const screen = await render(EntityChip, {
		label: "Order intake",
		kind: "Loop",
		status: "queued",
		onSelect,
	});

	await screen.getByRole("button", { name: "Order intake" }).click();
	expect(onSelect).toHaveBeenCalledTimes(1);
});
