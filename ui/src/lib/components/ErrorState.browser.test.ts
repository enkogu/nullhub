import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import ErrorState from "./ErrorState.svelte";

test("renders error details and retry action", async () => {
	const onRetry = vi.fn();
	const screen = await render(ErrorState, {
		title: "Work feed unavailable",
		message: "The Hub API returned an unavailable response.",
		details: "GET /api/events -> 503",
		retryLabel: "Retry",
		onRetry,
	});

	await expect.element(screen.getByText("Work feed unavailable")).toBeVisible();
	await expect.element(screen.getByText("GET /api/events -> 503")).toBeVisible();
	await screen.getByRole("button", { name: "Retry" }).click();
	expect(onRetry).toHaveBeenCalledTimes(1);
});
