<script lang="ts">
  import NullTicketsWorkspacePage from "$lib/components/nulltickets/NullTicketsWorkspacePage.svelte";

  const views = ["tasks"] as const;
</script>

<NullTicketsWorkspacePage
  title="Dependencies"
  subtitle="Inspect blockers, ready work, and dependency edges."
  initialView="tasks"
  workMode="dependencies"
  {views}
/>
