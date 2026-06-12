import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import PackageLibraryView from "./PackageLibraryView.svelte";
import { marketPackages } from "./fixtures";

test("renders installed library packages with download evidence", async () => {
  const screen = await render(PackageLibraryView, {
    packages: marketPackages.slice(0, 2),
    spaceId: "ops",
  });

  await expect.element(screen.getByRole("heading", { name: "Installed" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "NullClaw Agent Component" })).toBeVisible();
  await expect.element(screen.getByText("Manifest v1.0.0").first()).toBeVisible();
  await expect.element(screen.getByRole("link", { name: "Download JSON" }).first()).toHaveAttribute(
    "href",
    "/api/market/library/builtin.nullclaw-agent.json?space=ops",
  );
});

test("filters My Packages to exported manifests and retries library reads", async () => {
  const onRetry = vi.fn();
  const exported = {
    ...marketPackages[1],
    id: "export.ops.loop-kit",
    config: { export: { source_space: "ops", scope: "selection" } },
  };
  const screen = await render(PackageLibraryView, {
    title: "My Packages",
    packages: [marketPackages[0], exported],
    exportedOnly: true,
    onRetry,
    spaceId: "ops",
  });

  await expect.element(screen.getByRole("heading", { name: "My Packages" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Built-in Loop Templates" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "NullClaw Agent Component" })).not.toBeInTheDocument();
  await screen.getByRole("button", { name: "Refresh" }).click();
  expect(onRetry).toHaveBeenCalledTimes(1);
});
