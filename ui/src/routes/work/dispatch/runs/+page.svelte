<script lang="ts">
  import NullTicketsWorkspacePage from "$lib/components/nulltickets/NullTicketsWorkspacePage.svelte";

  const views = ["runs", "tasks"] as const;
</script>

<NullTicketsWorkspacePage
  title="Dispatch Runs"
  initialView="runs"
  {views}
/>
