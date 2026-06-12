<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import SectionOverview from "./SectionOverview.svelte";

  const teamOverviewArgs = {
    title: "Team",
    subtitle: "Agents, instances, roles, skills, and runtime capabilities for the selected space.",
    primaryHref: "/team/agents",
    primaryLabel: "Open agents",
    summaries: [
      { label: "Staff", value: "Agents", description: "Hire, inspect, and open agent detail pages." },
      { label: "Runtime", value: "Instances", description: "Manage installed component instances." },
      { label: "Capabilities", value: "Skills", description: "Review skills, MCP, memory, hooks, and schedules." },
    ],
    tabs: [
      {
        value: "staff",
        label: "Staff",
        description: "Agent-facing team panels for active staff, profiles, and roles.",
        links: [
          { label: "Agents", href: "/team/agents", description: "Active staff, status, current work, and hire flow.", status: "Primary" },
          { label: "Roles", href: "/team/agents/roles", description: "Role definitions and responsibility boundaries." },
        ],
      },
      {
        value: "capabilities",
        label: "Capabilities",
        description: "Team capabilities mounted from existing integration panels.",
        links: [
          { label: "Skills", href: "/team/capabilities/skills", description: "Installed skills and agent-visible toolkits." },
          { label: "MCP", href: "/team/capabilities/mcp", description: "MCP servers and tool availability." },
        ],
      },
    ],
  };

  const { Story } = defineMeta({
    title: "Components/SectionOverview",
    component: SectionOverview,
  });
</script>

{#snippet overviewTemplate(args)}
  <div class="max-w-5xl">
    <SectionOverview {...args} />
  </div>
{/snippet}

<Story name="Populated" args={teamOverviewArgs} template={overviewTemplate} />
<Story
  name="Loading"
  args={{
    ...teamOverviewArgs,
    state: "loading",
    loadingTitle: "Loading Team",
    loadingDescription: "Fetching team sections for the selected space.",
  }}
  template={overviewTemplate}
/>
<Story
  name="Empty"
  args={{
    ...teamOverviewArgs,
    state: "empty",
    emptyTitle: "No Team panels",
    emptyDescription: "Team panels will appear once this space has agents, instances, or capabilities.",
    emptyActionLabel: "Open agents",
    emptyActionHref: "/team/agents",
  }}
  template={overviewTemplate}
/>
<Story
  name="Error"
  args={{
    ...teamOverviewArgs,
    state: "error",
    errorTitle: "Unable to load Team",
    errorMessage: "Team overview data could not be fetched.",
    errorDetails: "GET /api/team/overview -> 503",
    retryLabel: "Retry",
  }}
  template={overviewTemplate}
/>
