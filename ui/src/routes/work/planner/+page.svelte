<script lang="ts">
  import NullTicketsWorkspacePage from "$lib/components/nulltickets/NullTicketsWorkspacePage.svelte";

  const views = ["tasks"] as const;
</script>

<NullTicketsWorkspacePage
  title="Planner"
  subtitle="Prioritize visible work by process, stage, and priority."
  initialView="tasks"
  workMode="planner"
  {views}
/>
