<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import AgentCard from "./AgentCard.svelte";

  const { Story } = defineMeta({
    title: "Components/AgentCard",
    component: AgentCard,
  });
</script>

<Story
  name="Running"
  args={{
    name: "SDR-agent",
    status: "running",
    role: "sales",
    currentWork: "Loop #41 is active",
    dailyCost: "$1.20/day",
    sourceKit: "Outbound Sales",
    href: "/team/instances/nullclaw/sdr-agent",
  }}
/>

<Story
  name="Idle"
  args={{
    name: "Bookkeeper",
    status: "stopped",
    role: "finance",
    currentWork: "Waiting for a new mandate",
    dailyCost: "$0.40/day",
    sourceKit: "Accounting",
  }}
/>
