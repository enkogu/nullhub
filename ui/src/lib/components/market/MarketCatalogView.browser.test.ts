import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import MarketCatalogView from "./MarketCatalogView.svelte";
import { marketPackages } from "./fixtures";

test("renders loading, empty, and error states", async () => {
  const loading = await render(MarketCatalogView, { state: "loading", packages: [] });
  await expect.element(loading.getByRole("status")).toHaveTextContent("Loading Market");

  const empty = await render(MarketCatalogView, { state: "empty", packages: [] });
  await expect.element(empty.getByText("No packages in the built-in catalog")).toBeVisible();

  const onRetry = vi.fn();
  const error = await render(MarketCatalogView, {
    state: "error",
    error: Object.assign(new Error("Catalog unavailable."), { status: 503 }),
    onRetry,
  });
  await expect.element(error.getByText("Market unavailable")).toBeVisible();
  await error.getByRole("button", { name: "Retry" }).click();
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("filters populated catalog by type, scale, stage, and query", async () => {
  const screen = await render(MarketCatalogView, {
    packages: marketPackages,
    installedPackageIds: new Set(["builtin.nullclaw-agent"]),
  });

  await expect.element(screen.getByRole("heading", { name: "Market" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Built-in Loop Templates" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "MCP Server Starters" })).toBeVisible();
  await expect.element(screen.getByText("Installed", { exact: true })).toBeVisible();

  await screen.getByRole("combobox", { name: "Type" }).selectOptions("mcp_server");
  await expect.element(screen.getByRole("heading", { name: "MCP Server Starters" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Built-in Loop Templates" })).not.toBeInTheDocument();

  await screen.getByRole("combobox", { name: "Type" }).selectOptions("");
  await screen.getByRole("combobox", { name: "Scale" }).selectOptions("blueprint");
  await expect.element(screen.getByRole("heading", { name: "Space Operations Blueprint" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "MCP Server Starters" })).not.toBeInTheDocument();

  await screen.getByRole("combobox", { name: "Scale" }).selectOptions("");
  await screen.getByRole("combobox", { name: "Stage" }).selectOptions("foundation");
  await expect.element(screen.getByRole("heading", { name: "NullClaw Agent Component" })).toBeVisible();

  const search = screen.getByRole("textbox", { name: "Search packages" });
  await search.fill("nothing matches");
  await expect.element(screen.getByText("No packages match these filters")).toBeVisible();
});
