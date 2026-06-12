<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import UsageOverview from "./UsageOverview.svelte";

  const usageData = {
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

  const { Story } = defineMeta({
    title: "Components/UsageOverview",
    component: UsageOverview,
  });
</script>

<Story
  name="Populated"
  args={{
    data: usageData,
    window: "7d",
    spaceLabel: "All spaces",
  }}
/>

<Story
  name="Loading"
  args={{
    data: null,
    loading: true,
    window: "7d",
    spaceLabel: "All spaces",
  }}
/>

<Story
  name="Empty"
  args={{
    data: {
      window: "7d",
      generated_at: 1780870800,
      totals: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        requests: 0,
      },
      by_instance: [],
      by_model: [],
      timeseries: [],
    },
    window: "7d",
    spaceLabel: "All spaces",
  }}
/>

<Story
  name="Error"
  args={{
    data: null,
    error: "Usage endpoint unavailable.",
    window: "7d",
    spaceLabel: "All spaces",
  }}
/>
