<script lang="ts">
  import NullTicketsWorkspacePage from "$lib/components/nulltickets/NullTicketsWorkspacePage.svelte";

  const views = ["pipelines"] as const;
</script>

<NullTicketsWorkspacePage
  title="Processes"
  initialView="pipelines"
  {views}
/>
