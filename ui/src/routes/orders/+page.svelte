<script lang="ts">
  import SectionOverview, { type SectionOverviewSummary, type SectionOverviewTab } from "$lib/components/SectionOverview.svelte";

  const summaries: SectionOverviewSummary[] = [
    {
      label: "Repeatable work",
      value: "Loops",
      description: "Ticket-backed cycles with review and evidence.",
    },
    {
      label: "Orchestration",
      value: "Workflows",
      description: "Graph-authored order flows and workflow runs.",
    },
    {
      label: "Authoring",
      value: "Task flows",
      description: "Durable order definitions before live execution.",
    },
  ];

  const tabs: SectionOverviewTab[] = [
    {
      value: "loops",
      label: "Loops",
      description: "Loop definitions, installed loops, and the local loop library.",
      links: [
        { label: "Loops", href: "/orders/loops", description: "Overview, installed Loops, and gallery tabs.", status: "Primary" },
        { label: "Loop library", href: "/orders/loops/library", description: "Installable loop templates for the selected space." },
      ],
    },
    {
      value: "workflows",
      label: "Workflows",
      description: "NullBoiler workflow definitions and execution records mounted under Orders.",
      links: [
        { label: "Workflows", href: "/orders/workflows", description: "Reusable workflow definitions from the selected NullBoiler instance.", status: "Definitions" },
        { label: "Workflow runs", href: "/orders/workflows/runs", description: "Run records for workflow executions and forks." },
      ],
    },
    {
      value: "authoring",
      label: "Authoring",
      description: "Order authoring surfaces that stay separate from live Work evidence.",
      links: [
        { label: "Task flows", href: "/orders/task-flows", description: "Author graph-backed order material before dispatch." },
      ],
    },
  ];
</script>

<SectionOverview
  title="Orders"
  subtitle="Schedules, policies, Loops, and Workflows that define what should happen."
  {summaries}
  {tabs}
  primaryHref="/orders/loops"
  primaryLabel="Open Loops"
/>
