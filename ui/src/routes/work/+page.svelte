<script lang="ts">
  import NullTicketsWorkspacePage from "$lib/components/nulltickets/NullTicketsWorkspacePage.svelte";
  import WorkTabs from "$lib/components/work/WorkTabs.svelte";

  const views = ["tasks"] as const;
</script>

<div class="space-y-4">
  <WorkTabs />
  <NullTicketsWorkspacePage
    title="Work Board"
    initialView="tasks"
    {views}
  />
</div>
