<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import InboxList, { type InboxListState } from '$lib/components/inbox/InboxList.svelte';
  import type { InboxDecisionInput } from '$lib/components/inbox/inbox';
  import { PageHeader } from '$lib/components/ui/page-header';
  import { approvalsStore } from '$lib/stores/approvals.svelte';
  import { spacesStore } from '$lib/stores/spaces.svelte';
  import type { Approval, ApprovalListParams } from '$lib/api/client';
  import type { PollStop } from '$lib/poll';

  let mounted = false;
  let stopPolling: PollStop | null = null;
  let nowMs = $state(Date.now());
  let selectedSpaceKey = $derived(`${$page.url.searchParams.get('space') ?? ''}:${spacesStore.selectedSpaceId ?? 'all'}`);
  let listState = $derived((approvalsStore.status === 'idle' ? 'loading' : approvalsStore.status) as InboxListState);
  let listError = $derived(approvalsStore.error ? new Error(approvalsStore.error) : null);

  function currentListParams(): ApprovalListParams {
    return { limit: 100, spaceId: spacesStore.selectedSpaceId };
  }

  function startInboxPolling() {
    stopPolling?.();
    stopPolling = approvalsStore.startPolling(currentListParams(), 10_000);
  }

  function retryInbox() {
    void approvalsStore.refresh(currentListParams()).catch(() => undefined);
  }

  async function decide(approval: Approval, input: InboxDecisionInput) {
    await approvalsStore.decide(approval, input);
  }

  function openRun(approval: Approval) {
    void goto(approval.targetRef ? '/work/live' : '/work');
  }

  $effect(() => {
    selectedSpaceKey;
    if (mounted) startInboxPolling();
  });

  onMount(() => {
    mounted = true;
    const nowTimer = setInterval(() => {
      nowMs = Date.now();
    }, 60_000);
    startInboxPolling();
    return () => {
      mounted = false;
      clearInterval(nowTimer);
      stopPolling?.();
      stopPolling = null;
    };
  });
</script>

<div class="inbox-page">
  <PageHeader title="Inbox" subtitle="Requests, approvals, and unresolved inputs." />

  <InboxList
    approvals={approvalsStore.approvals}
    {listState}
    error={listError}
    {nowMs}
    onDecide={decide}
    onRetry={retryInbox}
    onOpenRun={openRun}
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
