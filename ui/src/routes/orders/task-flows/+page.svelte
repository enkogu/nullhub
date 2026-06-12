<script lang="ts">
  import NullTicketsWorkspacePage from "$lib/components/nulltickets/NullTicketsWorkspacePage.svelte";

  const views = ["pipelines"] as const;
</script>

<NullTicketsWorkspacePage
  title="Task Flows"
  initialView="pipelines"
  {views}
/>
