import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import PackageExportWizard from "./PackageExportWizard.svelte";
import { marketPackages } from "./fixtures";

test("builds a selection export request from selected library packages", async () => {
  const onExport = vi.fn();
  const screen = await render(PackageExportWizard, {
    installedPackages: marketPackages.slice(0, 2),
    onExport,
  });

  await screen.getByRole("radio", { name: /Selection/ }).click();
  await screen.getByRole("checkbox", { name: /NullClaw Agent Component/ }).click();
  await screen.getByRole("button", { name: "Continue" }).click();
  await screen.getByRole("textbox", { name: "Package id" }).fill("export.ops.agent");
  await screen.getByRole("textbox", { name: "Name" }).fill("Ops Agent Package");
  await screen.getByRole("button", { name: "Continue" }).click();
  await expect.element(screen.getByText("selection")).toBeVisible();
  await screen.getByRole("button", { name: "Export package" }).click();

  expect(onExport).toHaveBeenCalledWith({
    scope: "selection",
    scale: "kit",
    id: "export.ops.agent",
    name: "Ops Agent Package",
    version: "1.0.0",
    selection: { packages: ["builtin.nullclaw-agent"] },
  });
});

test("surfaces backend export evidence without enabling install execution", async () => {
  const screen = await render(PackageExportWizard, {
    installedPackages: marketPackages.slice(0, 1),
    exportResult: {
      status: "exported",
      packageId: "export.ops.blueprint",
      file: "/tmp/nullhub/spaces/ops/packages/export.ops.blueprint.json",
      downloadUrl: "/api/market/library/export.ops.blueprint.json?space=ops",
      package: marketPackages[0],
      raw: {},
    },
  });

  await screen.getByRole("button", { name: "Continue" }).click();
  await screen.getByRole("button", { name: "Continue" }).click();
  await expect.element(screen.getByText("Export created")).toBeVisible();
  await expect.element(screen.getByText("Not run by this wizard")).toBeVisible();
  await expect.element(screen.getByRole("link", { name: "Download JSON" })).toHaveAttribute(
    "href",
    "/api/market/library/export.ops.blueprint.json?space=ops",
  );
});
