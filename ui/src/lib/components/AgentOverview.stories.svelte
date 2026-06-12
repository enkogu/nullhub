<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import AgentOverview from "./AgentOverview.svelte";

  const baseInstance = {
    status: "running",
    version: "playwright-fixture",
    launch_mode: "gateway",
    port: 19801,
    pid: 9142,
    uptime_seconds: 7265,
    auto_start: true,
    verbose: false,
    current_runs: 2,
    orders_as_executor: 4,
  };

  const providerStatus = {
    provider: "openrouter",
    model: "openai/gpt-5.5",
    configured: true,
  };

  const usageData = {
    rows: [
      {
        provider: "openrouter",
        model: "openai/gpt-5.5",
        prompt_tokens: 1200,
        completion_tokens: 460,
        total_tokens: 1660,
        requests: 8,
        last_used: 1780870800,
        total_cost_usd: 0.084,
      },
      {
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4.6",
        prompt_tokens: 640,
        completion_tokens: 230,
        total_tokens: 870,
        requests: 3,
        last_used: 1780867200,
        total_cost_usd: 0.043,
      },
    ],
    totals: {
      prompt_tokens: 1840,
      completion_tokens: 690,
      total_tokens: 2530,
      requests: 11,
      total_cost_usd: 0.127,
    },
  };

  const { Story } = defineMeta({
    title: "Components/AgentOverview",
    component: AgentOverview,
  });
</script>

<Story
  name="Populated"
  args={{
    name: "Athena",
    instance: baseInstance,
    modelName: "openai/gpt-5.5",
    providerStatus,
    providerHealth: { live_ok: true },
    providerOk: true,
    usageData,
  }}
/>

<Story
  name="Loading usage"
  args={{
    name: "Athena",
    instance: baseInstance,
    modelName: "openai/gpt-5.5",
    providerStatus,
    providerHealthLoading: true,
    usageLoading: true,
  }}
/>

<Story
  name="Empty metrics"
  args={{
    name: "Athena",
    instance: { status: "stopped", version: "playwright-fixture" },
    modelName: "",
    providerStatus: {},
    usageData: {
      rows: [],
      totals: {
        total_tokens: 0,
        requests: 0,
      },
    },
  }}
/>

<Story
  name="Error"
  args={{
    name: "Athena",
    instance: baseInstance,
    modelName: "openai/gpt-5.5",
    providerStatus,
    providerHealth: { live_ok: false },
    providerOk: false,
    providerHintText: "Invalid API key (401)",
    usageError: "Usage endpoint unavailable.",
  }}
/>
