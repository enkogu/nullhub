<script lang="ts">
  import DataState from "$lib/components/DataState.svelte";
  import { Button } from "$lib/components/ui/button";
  import { PageHeader } from "$lib/components/ui/page-header";
</script>

<div class="marketplace-page">
  <PageHeader
    title="Loop Marketplace"
    subtitle="Browse remote loop templates and install them into the local Library."
    align="start"
  >
    {#snippet actions()}
      <Button href="/orders/loops/library" size="sm">Open Library</Button>
    {/snippet}
  </PageHeader>

  <DataState
    state="empty"
    emptyTitle="Marketplace service is not connected"
    emptyDescription="Remote loop catalog sync will appear here once the marketplace service is configured. Installed and built-in loops are available in Library."
    emptyActionLabel="Open Library"
    emptyActionHref="/orders/loops/library"
  />
</div>

<style>
  .marketplace-page {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
  }

</style>
