import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import DataStateFixture from "./DataState.fixture.svelte";

test("renders loading, empty, error, and populated states", async () => {
	const loading = await render(DataStateFixture, { state: "loading" });
	await expect.element(loading.getByRole("status")).toHaveTextContent("Loading inbox");

	const empty = await render(DataStateFixture, { state: "empty" });
	await expect.element(empty.getByText("No inbox requests")).toBeVisible();

	const onRetry = vi.fn();
	const error = await render(DataStateFixture, {
		state: "error",
		error: Object.assign(new Error("GET /api/approvals failed."), { status: 503 }),
		onRetry,
	});
	await expect.element(error.getByText("Inbox unavailable")).toBeVisible();
	await expect.element(error.getByText("GET /api/approvals failed.")).toBeVisible();
	await error.getByRole("button", { name: "Retry" }).click();
	expect(onRetry).toHaveBeenCalledTimes(1);

	const populated = await render(DataStateFixture, { state: "populated" });
	await expect.element(populated.getByText("Loaded inbox item")).toBeVisible();
});

test("surfaces circuit breaker errors as retryable ErrorState copy", async () => {
	const breakerError = Object.assign(new Error("NullHub backend unreachable; retrying shortly."), {
		status: 0,
		body: { circuitOpen: true },
	});
	const screen = await render(DataStateFixture, {
		state: "error",
		error: breakerError,
	});

	await expect.element(screen.getByText("NullHub backend is temporarily unavailable. Retry once the connection recovers.")).toBeVisible();
	await expect.element(screen.getByText("NullHub backend unreachable; retrying shortly.")).toBeVisible();
});
