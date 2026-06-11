<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api, nullBoilerApi } from '$lib/api/client';
  import LiveRunsFeed, { type LiveRunsFeedState } from '$lib/components/work/LiveRunsFeed.svelte';
  import WorkTabs from '$lib/components/work/WorkTabs.svelte';
  import { Button } from '$lib/components/ui/button';
  import { PageHeader } from '$lib/components/ui/page-header';
  import { Select } from '$lib/components/ui/select';
  import { eventsStore } from '$lib/stores/events.svelte';
  import { spacesStore } from '$lib/stores/spaces.svelte';
  import { emptyLoopsState, loadLoopsState, type LoopsState, type TaskDetailCache } from '$lib/loops/data';
  import {
    getSelectedBoilerInstance,
    getSelectedTicketsInstance,
    setSelectedBoilerInstance,
    setSelectedTicketsInstance,
  } from '$lib/nullstack/backendSelection';
  import { pollWhileVisible, type PollStop } from '$lib/poll';
  import {
    agentEventsToLiveRuns,
    liveRefreshIntervalMs,
    loopRunsToLiveRuns,
    mergeLiveRuns,
    waitingTasksToLiveRuns,
    workflowRunsToLiveRuns,
    type LiveRun,
    type LiveWatchContext,
  } from '$lib/components/work/live';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

  let mounted = false;
  let stopPolling: PollStop | null = null;
  let feedState = $state<LiveRunsFeedState>('idle');
  let liveRuns = $state<LiveRun[]>([]);
  let error = $state<unknown>(null);
  let refreshing = $state(false);
  let requiresSpace = $state(false);
  let nowMs = $state(Date.now());
  let scopedInstances = $state<Record<string, Record<string, any>>>({});
  let selectedTicketsInstance = $state('');
  let selectedBoilerInstance = $state('');
  let requestSeq = 0;
  let loadInFlight = false;
  let pendingLoad = false;
  const detailCache: TaskDetailCache = new Map();

  let selectedSpaceKey = $derived(`${$page.url.searchParams.get('space') ?? ''}:${spacesStore.selectedSpaceId ?? 'all'}`);

  function instanceEntries(componentName: string): [string, any][] {
    return Object.entries(scopedInstances[componentName] || {}).sort(([a], [b]) => a.localeCompare(b));
  }

  function defaultInstanceName(instances: Record<string, Record<string, any>>, componentName: string, fallback: string): string {
    const entries = Object.entries(instances[componentName] || {});
    const running = entries.find(([, info]) => info?.status === 'running');
    const preferred = running || entries.find(([name]) => name === fallback) || entries[0];
    return preferred?.[0] || fallback;
  }

  function resolvedTicketsInstance(instances = scopedInstances): string {
    const entries = instances.nulltickets || {};
    if (selectedTicketsInstance && entries[selectedTicketsInstance]) return selectedTicketsInstance;
    const stored = getSelectedTicketsInstance();
    if (stored && entries[stored]) return stored;
    return defaultInstanceName(instances, 'nulltickets', 'tickets');
  }

  function resolvedBoilerInstance(instances = scopedInstances): string {
    const entries = instances.nullboiler || {};
    if (Object.keys(entries).length === 0) return '';
    if (selectedBoilerInstance && entries[selectedBoilerInstance]) return selectedBoilerInstance;
    const stored = getSelectedBoilerInstance();
    if (stored && entries[stored]) return stored;
    return defaultInstanceName(instances, 'nullboiler', '');
  }

  function runningWatchName(instances = scopedInstances): string {
    const watches = instances.nullwatch || {};
    const running = Object.entries(watches).find(([, info]: [string, any]) => info?.status === 'running');
    return running?.[0] || '';
  }

  async function watchContext(instances: Record<string, Record<string, any>>, spaceId: string): Promise<LiveWatchContext> {
    const selectedWatch = runningWatchName(instances);
    if (!selectedWatch) return { running: false };
    try {
      const runs = await api.getNullWatchRuns({ limit: 50, watch: selectedWatch, space: spaceId });
      const observedRunIds = new Set<string>(
        (Array.isArray(runs?.items) ? runs.items : [])
          .filter((run: any) => {
            const runSpace = String(run?.space_id ?? run?.spaceId ?? '').trim();
            return !runSpace || runSpace === spaceId;
          })
          .map((run: any): string => String(run?.run_id || run?.id || '').trim())
          .filter(Boolean),
      );
      return { running: true, selectedWatch, observedRunIds };
    } catch {
      return { running: false, selectedWatch };
    }
  }

  function handleTicketsChange(event: Event) {
    selectedTicketsInstance = (event.currentTarget as HTMLSelectElement).value;
    setSelectedTicketsInstance(selectedTicketsInstance);
    void loadLive();
  }

  function handleBoilerChange(event: Event) {
    selectedBoilerInstance = (event.currentTarget as HTMLSelectElement).value;
    setSelectedBoilerInstance(selectedBoilerInstance);
    void loadLive();
  }

  function clearVisibleRowsForReload(options: { quiet?: boolean }) {
    if (!options.quiet) {
      liveRuns = [];
      feedState = 'loading';
    }
  }

  function defaultInstanceNameFromStatus(status: any, componentName: string, fallback: string): string {
    const instances = status?.instances?.[componentName] || {};
    return Object.keys(instances)[0] || fallback;
  }

  async function safeLoadLoops(instance: string): Promise<LoopsState> {
    try {
      return await loadLoopsState(instance, detailCache);
    } catch {
      return emptyLoopsState();
    }
  }

  async function safeLoadWorkflowRuns(instance: string) {
    try {
      return await nullBoilerApi.listRunsPage({
        limit: 50,
        boilerInstance: instance,
      });
    } catch {
      return { items: [], hasMore: false };
    }
  }

  async function loadLive(options: { quiet?: boolean } = {}) {
    const seq = ++requestSeq;
    const selectedSpaceId = spacesStore.selectedSpaceId;
    requiresSpace = !selectedSpaceId;
    clearVisibleRowsForReload(options);
    refreshing = true;
    error = null;

    if (!selectedSpaceId) {
      pendingLoad = false;
      liveRuns = [];
      feedState = 'ready';
      refreshing = false;
      return;
    }

    if (loadInFlight) {
      pendingLoad = true;
      return;
    }

    loadInFlight = true;

    try {
      const instancesResult = await api.getInstances();
      if (seq !== requestSeq) return;
      const instances = (instancesResult?.instances || {}) as Record<string, Record<string, any>>;
      scopedInstances = instances;
      selectedTicketsInstance = resolvedTicketsInstance(instances);
      selectedBoilerInstance = resolvedBoilerInstance(instances);

      const [loopsState, workflowPage, watch] = await Promise.all([
        safeLoadLoops(selectedTicketsInstance || defaultInstanceNameFromStatus({ instances }, 'nulltickets', 'tickets')),
        safeLoadWorkflowRuns(selectedBoilerInstance),
        watchContext(instances, selectedSpaceId),
        eventsStore.refresh({ limit: 50, spaceId: selectedSpaceId }),
      ]);

      if (seq !== requestSeq) return;
      liveRuns = mergeLiveRuns([
        loopRunsToLiveRuns(loopsState.rows, watch, nowMs),
        waitingTasksToLiveRuns(loopsState.queue, nowMs),
        workflowRunsToLiveRuns((workflowPage?.items || []) as Record<string, unknown>[], watch, nowMs, {
          boilerInstance: selectedBoilerInstance,
        }),
        agentEventsToLiveRuns(eventsStore.events, nowMs),
      ]);
      feedState = 'ready';
      error = null;
    } catch (e) {
      if (seq === requestSeq) {
        error = e;
        feedState = 'error';
      }
    } finally {
      loadInFlight = false;
      if (seq === requestSeq) refreshing = false;
      if (pendingLoad) {
        pendingLoad = false;
        void loadLive({ quiet: true });
      }
    }
  }

  function retryLive() {
    void loadLive();
  }

  function startLivePolling() {
    stopPolling?.();
    stopPolling = pollWhileVisible(() => loadLive({ quiet: true }), liveRefreshIntervalMs);
  }

  $effect(() => {
    selectedSpaceKey;
    if (mounted) {
      void loadLive();
      startLivePolling();
    }
  });

  onMount(() => {
    mounted = true;
    selectedTicketsInstance = getSelectedTicketsInstance();
    selectedBoilerInstance = getSelectedBoilerInstance();
    const nowTimer = setInterval(() => {
      nowMs = Date.now();
    }, 60_000);
    void loadLive();
    startLivePolling();
    return () => {
      mounted = false;
      clearInterval(nowTimer);
      stopPolling?.();
      stopPolling = null;
    };
  });
</script>

<div class="space-y-5">
  <WorkTabs />

  <PageHeader title="Live" subtitle="Loop runs, workflow runs, and agent tasks across the selected Space.">
    {#snippet controls()}
      {#if instanceEntries('nulltickets').length > 1}
        <Select value={selectedTicketsInstance} aria-label="NullTickets instance" class="w-full md:w-44" onchange={handleTicketsChange}>
          {#each instanceEntries('nulltickets') as [name, info] (name)}
            <option value={name}>{name} · {info?.status || 'unknown'}</option>
          {/each}
        </Select>
      {/if}
      {#if instanceEntries('nullboiler').length > 1}
        <Select value={selectedBoilerInstance} aria-label="NullBoiler instance" class="w-full md:w-44" onchange={handleBoilerChange}>
          {#each instanceEntries('nullboiler') as [name, info] (name)}
            <option value={name}>{name} · {info?.status || 'unknown'}</option>
          {/each}
        </Select>
      {/if}
    {/snippet}
    {#snippet actions()}
      <Button variant="outline" size="sm" onclick={() => void loadLive()} disabled={refreshing}>
        <RefreshCwIcon class="size-4" aria-hidden="true" />
        {refreshing ? 'Refreshing' : 'Refresh'}
      </Button>
    {/snippet}
  </PageHeader>

  <LiveRunsFeed
    runs={liveRuns}
    {feedState}
    {error}
    {requiresSpace}
    {nowMs}
    onRetry={retryLive}
  />
</div>
