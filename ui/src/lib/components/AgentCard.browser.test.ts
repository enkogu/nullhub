import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import AgentCard from "./AgentCard.svelte";

test("renders the team agent card with status and metadata", async () => {
  const screen = await render(AgentCard, {
    name: "SDR-agent",
    status: "running",
    role: "sales",
    currentWork: "Loop #41 is active",
    dailyCost: "$1.20/day",
    sourceKit: "Outbound Sales",
    href: "/team/instances/nullclaw/sdr-agent",
  });

  await expect.element(screen.getByRole("heading", { name: "SDR-agent" })).toBeVisible();
  await expect.element(screen.getByText("Role: sales")).toBeVisible();
  await expect.element(screen.getByText("Loop #41 is active")).toBeVisible();
  await expect.element(screen.getByText("$1.20/day")).toBeVisible();
  await expect.element(screen.getByText("Kit: Outbound Sales")).toBeVisible();
});

test("falls back to button mode when no href is provided", async () => {
  const onOpen = vi.fn();
  const screen = await render(AgentCard, {
    name: "Bookkeeper",
    status: "stopped",
    role: "finance",
    currentWork: "Idle",
    onOpen,
  });

  await screen.getByRole("button", { name: "Open" }).click();
  expect(onOpen).toHaveBeenCalledTimes(1);
});
