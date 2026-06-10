import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import StatusDot from "./StatusDot.svelte";

test("renders a populated status label", async () => {
	const screen = await render(StatusDot, {
		status: "running",
		label: "Runtime online",
	});

	await expect.element(screen.getByText("Runtime online")).toBeVisible();
	expect(screen.container.querySelector('[data-slot="status-dot"]')).not.toBeNull();
});

test("renders dot-only status with an accessible label", async () => {
	const screen = await render(StatusDot, {
		status: "failed",
		label: "Run failed",
		showLabel: false,
	});

	expect(screen.container.querySelector('[role="status"][aria-label="Run failed"]')).not.toBeNull();
});
