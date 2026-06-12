import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import AgentOverview from "./AgentOverview.svelte";

const providerStatus = {
  provider: "openrouter",
  model: "openai/gpt-5.5",
  configured: true,
};

test("renders agent detail overview metrics from live payload fields", async () => {
  const onRefreshUsage = vi.fn();
  const screen = await render(AgentOverview, {
    name: "Athena",
    instance: {
      status: "running",
      version: "playwright-fixture",
      launch_mode: "gateway",
      port: 19801,
      uptime_seconds: 3600,
      current_runs: 3,
      orders_as_executor: 5,
      auto_start: true,
    },
    modelName: "openai/gpt-5.5",
    providerStatus,
    providerHealth: { live_ok: true },
    providerOk: true,
    usageData: {
      rows: [
        {
          provider: "openrouter",
          model: "openai/gpt-5.5",
          total_tokens: 2000,
          requests: 7,
          last_used: 1780870800,
          total_cost_usd: 0.125,
        },
      ],
      totals: {
        total_tokens: 2000,
        requests: 7,
        total_cost_usd: 0.125,
      },
    },
    onRefreshUsage,
  });

  expect(screen.container.textContent).toContain("Model");
  expect(screen.container.textContent).toContain("openai/gpt-5.5");
  expect(screen.container.textContent).toContain("Current runs");
  expect(screen.container.textContent).toContain("3");
  expect(screen.container.textContent).toContain("Orders as executor");
  expect(screen.container.textContent).toContain("5");
  expect(screen.container.textContent).toContain("$0.13");
  expect(screen.container.textContent).toContain("Healthy");
  expect(screen.container.textContent).toContain("2,000");

  await screen.getByRole("button", { name: "Refresh usage" }).click();
  expect(onRefreshUsage).toHaveBeenCalledTimes(1);
});

test("does not synthesize current work, executor orders, or cost when fields are absent", async () => {
  const screen = await render(AgentOverview, {
    name: "Athena",
    instance: {
      status: "running",
      version: "playwright-fixture",
      current_work: "Idle",
    },
    modelName: "openai/gpt-5.5",
    providerStatus,
    usageData: {
      rows: [
        {
          provider: "openrouter",
          model: "openai/gpt-5.5",
          total_tokens: 900,
          requests: 2,
        },
      ],
      totals: {
        total_tokens: 900,
        requests: 2,
      },
    },
  });

  await expect.element(screen.getByText("No current run field is present on this agent.")).toBeVisible();
  await expect.element(screen.getByText("Executor-order counts are not present in the status payload yet.")).toBeVisible();
  await expect.element(screen.getByText("Usage exists (900 tokens, 2 requests), but no cost field is reported.")).toBeVisible();
  expect(screen.container.textContent).not.toContain("$0.00");
});

test("renders loading and error usage states", async () => {
  const loading = await render(AgentOverview, {
    name: "Athena",
    instance: { status: "starting" },
    providerStatus,
    providerHealthLoading: true,
    usageLoading: true,
  });
  expect(loading.container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  await expect.element(loading.getByText("Checking")).toBeVisible();

  const error = await render(AgentOverview, {
    name: "Athena",
    instance: { status: "running" },
    providerStatus,
    usageError: "Usage endpoint unavailable.",
  });
  await expect.element(error.getByText("Usage endpoint unavailable.")).toBeVisible();
});
