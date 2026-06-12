<script lang="ts">
  import NullTicketsWorkspacePage from "$lib/components/nulltickets/NullTicketsWorkspacePage.svelte";

  const views = ["queue", "tasks"] as const;
</script>

<NullTicketsWorkspacePage
  title="Dispatch"
  initialView="queue"
  {views}
/>
