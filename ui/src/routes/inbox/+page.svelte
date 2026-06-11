<script lang="ts">
  import DataState from "$lib/components/DataState.svelte";
  import { PageHeader } from "$lib/components/ui/page-header";
</script>

<div class="inbox-page">
  <PageHeader title="Inbox" subtitle="Requests, approvals, and unresolved inputs." />

  <DataState
    state="empty"
    emptyTitle="No pending requests"
    emptyDescription="New approvals and inputs will appear here when a workspace flow needs attention."
  />
</div>

<style>
  .inbox-page {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
  }

</style>
