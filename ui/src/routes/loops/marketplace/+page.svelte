<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
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

  <Card class="empty-state">
    <h2>Marketplace service is not connected</h2>
    <p>
      Remote loop catalog sync will appear here once the marketplace service is configured.
      Installed and built-in loops are available in Library.
    </p>
    <Button href="/orders/loops/library" variant="outline" size="sm">Open Library</Button>
  </Card>
</div>

<style>
  .marketplace-page {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
  }

  :global(.empty-state) {
    align-items: flex-start;
    padding: 1.25rem;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 1rem;
    font-weight: 600;
  }

  p {
    max-width: 44rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }
</style>
