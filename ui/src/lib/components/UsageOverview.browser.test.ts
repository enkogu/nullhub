import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import UsageOverview from "./UsageOverview.svelte";

const populatedUsage = {
  window: "7d",
  generated_at: 1780870800,
  totals: {
    prompt_tokens: 4800,
    completion_tokens: 2200,
    total_tokens: 7000,
    requests: 18,
  },
  by_instance: [
    {
      component: "nullclaw",
      name: "athena",
      prompt_tokens: 3200,
      completion_tokens: 1500,
      total_tokens: 4700,
      requests: 12,
    },
    {
      component: "nullclaw",
      name: "iris",
      prompt_tokens: 1600,
      completion_tokens: 700,
      total_tokens: 2300,
      requests: 6,
    },
  ],
  by_model: [
    {
      provider: "openrouter",
      model: "openai/gpt-5.5",
      prompt_tokens: 4800,
      completion_tokens: 2200,
      total_tokens: 7000,
      requests: 18,
      last_used: 1780870800,
    },
  ],
};

test("renders populated usage without inventing spend", async () => {
  const onRefresh = vi.fn();
  const screen = await render(UsageOverview, {
    data: populatedUsage,
    window: "7d",
    spaceLabel: "All spaces",
    onRefresh,
  });

  expect(screen.container.textContent).toContain("Spend");
  expect(screen.container.textContent).toContain("Not reported");
  expect(screen.container.textContent).toContain("The usage API does not report spend fields yet.");
  expect(screen.container.textContent).toContain("Total tokens");
  expect(screen.container.textContent).toContain("7,000");
  expect(screen.container.textContent).toContain("All spaces");
  expect(screen.container.textContent).toContain("nullclaw/athena");
  expect(screen.container.textContent).toContain("openrouter");
  expect(screen.container.textContent).toContain("openai/gpt-5.5");

  await screen.getByRole("button", { name: "Refresh usage" }).click();
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

test("renders loading, empty, and error states", async () => {
  const loading = await render(UsageOverview, {
    loading: true,
    window: "7d",
    spaceLabel: "All spaces",
  });
  expect(loading.container.querySelector('[data-slot="skeleton"]')).not.toBeNull();

  const empty = await render(UsageOverview, {
    data: {
      window: "7d",
      generated_at: 1780870800,
      totals: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, requests: 0 },
      by_instance: [],
      by_model: [],
      timeseries: [],
    },
    window: "7d",
    spaceLabel: "All spaces",
  });
  await expect.element(empty.getByText("No usage recorded")).toBeVisible();
  await expect.element(empty.getByText("No agent usage")).toBeVisible();

  const error = await render(UsageOverview, {
    error: "Usage endpoint unavailable.",
    window: "7d",
    spaceLabel: "All spaces",
  });
  await expect.element(error.getByText("Usage data could not be loaded")).toBeVisible();
  await expect.element(error.getByText("Usage endpoint unavailable.").first()).toBeVisible();
});
