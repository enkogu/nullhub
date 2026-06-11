import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import UniversalEntityView from "./UniversalEntityView.svelte";

test("renders circuit breaker errors through DataState with retry", async () => {
	const breakerError = Object.assign(new Error("NullHub backend unreachable; retrying shortly."), {
		status: 0,
		body: { circuitOpen: true },
	});
	const onRefresh = vi.fn();

	const screen = await render(UniversalEntityView, {
		title: "Agents",
		records: [],
		columns: [],
		error: breakerError,
		onRefresh,
	});

	await expect
		.element(screen.getByText("NullHub backend is temporarily unavailable. Retry once the connection recovers."))
		.toBeVisible();
	await expect.element(screen.getByText("NullHub backend unreachable; retrying shortly.")).toBeVisible();
	await screen.getByText("Refresh").click();
	expect(onRefresh).toHaveBeenCalledTimes(1);
});
