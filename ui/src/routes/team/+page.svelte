<script lang="ts">
  import SectionOverview, { type SectionOverviewSummary, type SectionOverviewTab } from "$lib/components/SectionOverview.svelte";

  const summaries: SectionOverviewSummary[] = [
    {
      label: "Staff",
      value: "Agents",
      description: "Hire, inspect, and open NullClaw agent detail pages.",
    },
    {
      label: "Runtime",
      value: "Instances",
      description: "Manage installed Null Stack component instances.",
    },
    {
      label: "Capabilities",
      value: "Skills",
      description: "Review skills, MCP servers, memory, hooks, and schedules.",
    },
  ];

  const tabs: SectionOverviewTab[] = [
    {
      value: "staff",
      label: "Staff",
      description: "Agent-facing team panels for active staff, profiles, and roles.",
      links: [
        { label: "Agents", href: "/team/agents", description: "Active NullClaw staff, status, current work, and hire flow.", status: "Primary" },
        { label: "Profiles", href: "/team/agents/profiles", description: "Reusable agent profiles and operating defaults." },
        { label: "Roles", href: "/team/agents/roles", description: "Role definitions and responsibility boundaries." },
      ],
    },
    {
      value: "runtime",
      label: "Runtime",
      description: "Installed instances and component-level runtime panels.",
      links: [
        { label: "Instances", href: "/team/instances", description: "Installed Null Stack instances with status and actions.", status: "Inventory" },
        { label: "NullClaw agents", href: "/team/instances/nullclaw", description: "Open the NullClaw instance group and drill into individual agents." },
      ],
    },
    {
      value: "capabilities",
      label: "Capabilities",
      description: "Team capabilities mounted from the existing skills and integration panels.",
      links: [
        { label: "Skills", href: "/team/capabilities/skills", description: "Installed skills and agent-visible toolkits.", status: "Default" },
        { label: "MCP", href: "/team/capabilities/mcp", description: "MCP servers and tool availability." },
        { label: "Memory", href: "/team/capabilities/memory", description: "Knowledge and memory stores available to agents." },
        { label: "Hooks", href: "/team/capabilities/hooks", description: "Lifecycle hooks and event-driven capability wiring." },
        { label: "Instructions", href: "/team/capabilities/instructions", description: "Instruction files and prompt material." },
        { label: "Schedules", href: "/team/capabilities/schedules", description: "Recurring capability schedules." },
      ],
    },
  ];
</script>

<SectionOverview
  title="Team"
  subtitle="Agents, instances, roles, skills, and runtime capabilities for the selected space."
  {summaries}
  {tabs}
  primaryHref="/team/agents"
  primaryLabel="Open agents"
/>
