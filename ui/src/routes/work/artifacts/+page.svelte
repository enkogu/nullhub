<script lang="ts">
  import NullTicketsWorkspacePage from "$lib/components/nulltickets/NullTicketsWorkspacePage.svelte";

  const views = ["artifacts"] as const;
</script>

<NullTicketsWorkspacePage
  title="Artifacts"
  initialView="artifacts"
  initialArtifactScope="all"
  {views}
/>
