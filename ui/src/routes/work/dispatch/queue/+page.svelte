<script lang="ts">
  import NullTicketsWorkspacePage from "$lib/components/nulltickets/NullTicketsWorkspacePage.svelte";

  const views = ["queue"] as const;
</script>

<NullTicketsWorkspacePage
  title="Queue"
  initialView="queue"
  {views}
/>
