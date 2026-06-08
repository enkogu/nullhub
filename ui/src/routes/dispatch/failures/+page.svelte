<script lang="ts">
  import NullTicketsWorkspacePage from "$lib/components/nulltickets/NullTicketsWorkspacePage.svelte";

  const views = ["queue", "tasks", "runs"] as const;
</script>

<NullTicketsWorkspacePage
  title="Failures"
  initialView="queue"
  {views}
/>
