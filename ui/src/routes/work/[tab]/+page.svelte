<script lang="ts">
  import NullTicketsWorkspacePage from "$lib/components/nulltickets/NullTicketsWorkspacePage.svelte";
  import TodayWorkspace from "$lib/components/work/TodayWorkspace.svelte";
  import WorkTabPlaceholder from "$lib/components/work/WorkTabPlaceholder.svelte";

  let { data } = $props<{ data: { tab: string } }>();
</script>

{#if data.tab === "today"}
  <TodayWorkspace />
{:else if data.tab === "live"}
  <WorkTabPlaceholder
    title="Live"
    subtitle="Live supervision"
    body="Everything executing right now is still centered in Mission Control while the unified live run surface lands."
    actionLabel="Open Mission Control"
    actionHref="/work/mission-control"
  />
{:else if data.tab === "results"}
  <NullTicketsWorkspacePage
    title="Results"
    subtitle="Artifacts, deliverables, and evidence for the selected space."
    initialView="artifacts"
    initialArtifactScope="all"
    views={["artifacts"]}
  />
{:else if data.tab === "activity"}
  <WorkTabPlaceholder
    title="Activity"
    subtitle="Recent activity"
    body="The event-feed remount will surface task history and repeated patterns here. Until then, use Today for active intake and Results for outputs."
    actionLabel="Review Results"
    actionHref="/work/results"
  />
{/if}
