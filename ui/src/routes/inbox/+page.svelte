<script lang="ts">
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Card } from "$lib/components/ui/card";
</script>

<div class="inbox-page">
  <PageHeader title="Inbox" subtitle="Requests, approvals, and unresolved inputs." />

  <Card class="empty-inbox">
    <h2>No pending requests</h2>
    <p>New approvals and inputs will appear here when a workspace flow needs attention.</p>
  </Card>
</div>

<style>
  .inbox-page {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
  }

  :global(.empty-inbox) {
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
    max-width: 42rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }
</style>
