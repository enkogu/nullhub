import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import PackageDetailView from "./PackageDetailView.svelte";
import { marketPackages } from "./fixtures";

test("renders populated package detail with requirements and install review", async () => {
  const screen = await render(PackageDetailView, { pkg: marketPackages[2] });

  await expect.element(screen.getByRole("heading", { name: "MCP Server Starters" })).toBeVisible();
  await expect.element(screen.getByText("MCP servers")).toBeVisible();
  await expect.element(screen.getByText("Capability")).toBeVisible();
  await expect.element(screen.getByText("providers.search.api_key")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "context7-docs" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Install into Space" })).toBeDisabled();
  await expect.element(screen.getByText("Configure required secret refs before install execution.")).toBeVisible();
});

test("renders loading, empty, and error states", async () => {
  const loading = await render(PackageDetailView, { state: "loading" });
  await expect.element(loading.getByRole("status")).toHaveTextContent("Loading package");

  const empty = await render(PackageDetailView, { state: "empty" });
  await expect.element(empty.getByText("Package not found")).toBeVisible();

  const onRetry = vi.fn();
  const error = await render(PackageDetailView, {
    state: "error",
    error: Object.assign(new Error("Package unavailable."), { status: 503 }),
    onRetry,
  });
  await expect.element(error.getByText("Package unavailable", { exact: true })).toBeVisible();
  await error.getByRole("button", { name: "Retry" }).click();
  expect(onRetry).toHaveBeenCalledTimes(1);
});
