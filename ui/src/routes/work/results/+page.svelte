<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import ResultsGrid, { type ResultsGridState } from '$lib/components/work/ResultsGrid.svelte';
  import WorkTabs from '$lib/components/work/WorkTabs.svelte';
  import { Button } from '$lib/components/ui/button';
  import { PageHeader } from '$lib/components/ui/page-header';
  import { Select } from '$lib/components/ui/select';
  import { spacesStore } from '$lib/stores/spaces.svelte';
  import { ticketsComponent } from '$lib/loops/data';
  import type { LoopArtifact, LoopTask } from '$lib/loops/types';
  import { getSelectedTicketsInstance, setSelectedTicketsInstance } from '$lib/nullstack/backendSelection';
  import {
    artifactsToResults,
    mergeResults,
    ticketDeliverablesToResults,
    type WorkResult,
  } from '$lib/components/work/results';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

  const maxResultScan = 100;

  let mounted = false;
  let gridState = $state<ResultsGridState>('idle');
  let results = $state<WorkResult[]>([]);
  let error = $state<unknown>(null);
  let refreshing = $state(false);
  let requiresSpace = $state(false);
  let nowMs = $state(Date.now());
  let scopedInstances = $state<Record<string, Record<string, any>>>({});
  let selectedTicketsInstance = $state('');
  let requestSeq = 0;

  let selectedSpaceKey = $derived(`${$page.url.searchParams.get('space') ?? ''}:${spacesStore.selectedSpaceId ?? 'all'}`);

  function instanceEntries(componentName: string): [string, any][] {
    return Object.entries(scopedInstances[componentName] || {}).sort(([a], [b]) => a.localeCompare(b));
  }

  function defaultInstanceName(instances: Record<string, Record<string, any>>): string {
    const entries = Object.entries(instances[ticketsComponent] || {});
    const running = entries.find(([, info]) => info?.status === 'running');
    const preferred = running || entries.find(([name]) => name === 'tickets') || entries[0];
    return preferred?.[0] || '';
  }

  function resolvedTicketsInstance(instances = scopedInstances): string {
    const entries = instances[ticketsComponent] || {};
    if (selectedTicketsInstance && entries[selectedTicketsInstance]) return selectedTicketsInstance;
    const stored = getSelectedTicketsInstance();
    if (stored && entries[stored]) return stored;
    return defaultInstanceName(instances);
  }

  function handleTicketsChange(event: Event) {
    selectedTicketsInstance = (event.currentTarget as HTMLSelectElement).value;
    setSelectedTicketsInstance(selectedTicketsInstance);
    void loadResults();
  }

  async function safeLoadArtifacts(instance: string): Promise<LoopArtifact[]> {
    const artifactsResult = await api.nullTicketsArtifacts(ticketsComponent, instance, { limit: maxResultScan });
    return Array.isArray(artifactsResult?.items) ? artifactsResult.items : [];
  }

  async function safeLoadTasks(instance: string): Promise<LoopTask[]> {
    const tasksResult = await api.nullTicketsTasks(ticketsComponent, instance, { limit: maxResultScan });
    return Array.isArray(tasksResult?.items) ? tasksResult.items : [];
  }

  async function loadResults() {
    const seq = ++requestSeq;
    const selectedSpaceId = spacesStore.selectedSpaceId;
    requiresSpace = !selectedSpaceId;
    results = [];
    gridState = 'loading';
    refreshing = true;
    error = null;
    nowMs = Date.now();

    if (!selectedSpaceId) {
      gridState = 'ready';
      refreshing = false;
      return;
    }

    try {
      const instancesResult = await api.getInstances();
      if (seq !== requestSeq) return;
      const instances = (instancesResult?.instances || {}) as Record<string, Record<string, any>>;
      scopedInstances = instances;
      selectedTicketsInstance = resolvedTicketsInstance(instances);

      if (!selectedTicketsInstance) {
        results = [];
        gridState = 'ready';
        return;
      }

      const [tasks, artifacts] = await Promise.all([
        safeLoadTasks(selectedTicketsInstance),
        safeLoadArtifacts(selectedTicketsInstance),
      ]);
      if (seq !== requestSeq) return;

      results = mergeResults([ticketDeliverablesToResults(tasks), artifactsToResults(artifacts)]);
      gridState = 'ready';
      error = null;
    } catch (e) {
      if (seq === requestSeq) {
        error = e;
        gridState = 'error';
      }
    } finally {
      if (seq === requestSeq) refreshing = false;
    }
  }

  function retryResults() {
    void loadResults();
  }

  $effect(() => {
    selectedSpaceKey;
    if (mounted) void loadResults();
  });

  onMount(() => {
    mounted = true;
    selectedTicketsInstance = getSelectedTicketsInstance();
    void loadResults();
    return () => {
      mounted = false;
    };
  });
</script>

<div class="space-y-5">
  <WorkTabs />

  <PageHeader title="Results" subtitle="Ticket deliverables and run artifacts produced in the selected Space.">
    {#snippet controls()}
      {#if instanceEntries(ticketsComponent).length > 1}
        <Select value={selectedTicketsInstance} aria-label="NullTickets instance" class="w-full md:w-44" onchange={handleTicketsChange}>
          {#each instanceEntries(ticketsComponent) as [name, info] (name)}
            <option value={name}>{name} · {info?.status || 'unknown'}</option>
          {/each}
        </Select>
      {/if}
    {/snippet}
    {#snippet actions()}
      <Button variant="outline" size="sm" onclick={() => void loadResults()} disabled={refreshing}>
        <RefreshCwIcon class="size-4" aria-hidden="true" />
        {refreshing ? 'Refreshing' : 'Refresh'}
      </Button>
    {/snippet}
  </PageHeader>

  <ResultsGrid
    {results}
    {gridState}
    {error}
    {requiresSpace}
    spaceId={spacesStore.selectedSpaceId || ''}
    {nowMs}
    onRetry={retryResults}
  />
</div>
