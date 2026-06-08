<script lang="ts">
  import NullTicketsWorkspacePage from "$lib/components/nulltickets/NullTicketsWorkspacePage.svelte";

  const views = ["tasks"] as const;
</script>

<NullTicketsWorkspacePage
  title="Work Board"
  initialView="tasks"
  {views}
/>
