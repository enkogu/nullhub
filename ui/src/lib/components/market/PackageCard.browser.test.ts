import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import PackageCard from "./PackageCard.svelte";
import { marketPackages } from "./fixtures";

test("renders package scale, contributions, requirements, and review CTA", async () => {
  const screen = await render(PackageCard, { pkg: marketPackages[1] });

  await expect.element(screen.getByRole("heading", { name: "Built-in Loop Templates" })).toBeVisible();
  await expect.element(screen.getByText("kit")).toBeVisible();
  await expect.element(screen.getByText("Starter")).toBeVisible();
  await expect.element(screen.getByText("Loops")).toBeVisible();
  await expect.element(screen.getByText("Ship PR Until Green, Test Until Green")).toBeVisible();
  await expect.element(screen.getByText("Package: builtin.nullclaw-agent")).toBeVisible();
  await expect.element(screen.getByRole("link", { name: "Review package Built-in Loop Templates" })).toHaveAttribute(
    "href",
    "/market/builtin.loop-templates",
  );
});

test("marks installed packages", async () => {
  const screen = await render(PackageCard, { pkg: marketPackages[0], installed: true });

  await expect.element(screen.getByText("Installed")).toBeVisible();
});
