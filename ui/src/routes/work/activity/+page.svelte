<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import ActivityFeed, { type ActivityFeedState } from '$lib/components/work/ActivityFeed.svelte';
  import { PageHeader } from '$lib/components/ui/page-header';
  import { eventsStore } from '$lib/stores/events.svelte';
  import { spacesStore } from '$lib/stores/spaces.svelte';
  import type { EventListParams } from '$lib/api/client';
  import type { PollStop } from '$lib/poll';

  let mounted = false;
  let stopPolling: PollStop | null = null;
  let nowMs = $state(Date.now());
  let selectedSpaceKey = $derived(`${$page.url.searchParams.get('space') ?? ''}:${spacesStore.selectedSpaceId ?? 'all'}`);
  let feedState = $derived((eventsStore.status === 'idle' ? 'loading' : eventsStore.status) as ActivityFeedState);
  let feedError = $derived(eventsStore.error ? new Error(eventsStore.error) : null);

  function currentListParams(): EventListParams {
    return { limit: 50, spaceId: spacesStore.selectedSpaceId };
  }

  function startActivityPolling() {
    stopPolling?.();
    stopPolling = eventsStore.startPolling(currentListParams(), 5000);
  }

  function retryActivity() {
    void eventsStore.refresh(currentListParams()).catch(() => undefined);
  }

  $effect(() => {
    selectedSpaceKey;
    if (mounted) startActivityPolling();
  });

  onMount(() => {
    mounted = true;
    const nowTimer = setInterval(() => {
      nowMs = Date.now();
    }, 60_000);
    startActivityPolling();
    return () => {
      mounted = false;
      clearInterval(nowTimer);
      stopPolling?.();
      stopPolling = null;
    };
  });
</script>

<div class="space-y-5">
  <PageHeader title="Activity" subtitle="Chronicle of work, evidence, and agent events." />
  <ActivityFeed events={eventsStore.events} {feedState} error={feedError} {nowMs} onRetry={retryActivity} />
</div>
