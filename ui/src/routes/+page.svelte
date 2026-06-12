<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import InstanceCard from "$lib/components/InstanceCard.svelte";
  import { api, approvalsApi, eventsApi, type Approval } from "$lib/api/client";
  import { pollWhileVisible } from "$lib/poll";
  import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
  import NeedsYouList, { type NeedsYouListState } from "$lib/components/dashboard/NeedsYouList.svelte";
  import RunningNow, { type RunningNowState } from "$lib/components/dashboard/RunningNow.svelte";
  import { agentEventsToLiveRuns, type LiveRun } from "$lib/components/work/live";
  import { spacesStore } from "$lib/stores/spaces.svelte";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Button } from "$lib/components/ui/button";

  let status = $state<any>(null);
  let error = $state<unknown>(null);
  let loading = $state(true);
  let stopPolling: (() => void) | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const instanceEntries = $derived(
    Object.entries((status?.instances || {}) as Record<string, Record<string, any>>).flatMap(([component, instances]) =>
      Object.entries(instances).map(([name, info]) => ({ component, name, info })),
    ),
  );
  const dashboardState = $derived<DataStateKind>(
    error ? "error" : loading && !status ? "loading" : instanceEntries.length === 0 ? "empty" : "populated",
  );

  async function refresh() {
    loading = true;
    try {
      status = await api.getStatus();
      error = null;
    } catch (e) {
      error = e;
    } finally {
      loading = false;
    }
  }

  // Home top blocks: NeedsYou (pending approvals) and RunningNow (live work).
  // Each block loads independently — one failure must not blank the other.
  let needsYouApprovals = $state<Approval[]>([]);
  let needsYouState = $state<NeedsYouListState>("idle");
  let needsYouError = $state<unknown>(null);
  let runningNowRuns = $state<LiveRun[]>([]);
  let runningNowState = $state<RunningNowState>("idle");
  let runningNowError = $state<unknown>(null);
  let nowMs = $state(Date.now());
  let stopNeedsYouPolling: (() => void) | null = null;
  let stopRunningNowPolling: (() => void) | null = null;

  async function refreshNeedsYou() {
    try {
      const page = await approvalsApi.listApprovals({
        status: "pending",
        limit: 25,
        spaceId: spacesStore.selectedSpaceId,
      });
      needsYouApprovals = page.approvals;
      needsYouState = "ready";
      needsYouError = null;
    } catch (e) {
      needsYouState = "error";
      needsYouError = e;
    }
  }

  async function refreshRunningNow() {
    try {
      const page = await eventsApi.listEvents({ limit: 50, spaceId: spacesStore.selectedSpaceId });
      nowMs = Date.now();
      runningNowRuns = agentEventsToLiveRuns(page.events, nowMs);
      runningNowState = "ready";
      runningNowError = null;
    } catch (e) {
      runningNowState = "error";
      runningNowError = e;
    }
  }

  onMount(() => {
    refreshTimer = setTimeout(() => void refresh(), 350);
    stopPolling = pollWhileVisible(refresh, 5000);
    needsYouState = "loading";
    runningNowState = "loading";
    void refreshNeedsYou();
    void refreshRunningNow();
    stopNeedsYouPolling = pollWhileVisible(refreshNeedsYou, 30_000);
    stopRunningNowPolling = pollWhileVisible(refreshRunningNow, 10_000);
  });

  onDestroy(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
    stopPolling?.();
    stopNeedsYouPolling?.();
    stopRunningNowPolling?.();
  });
</script>

<div class="dashboard">
  <PageHeader title="Home" subtitle="Current workspace state and runtime status.">
    {#snippet actions()}
      <Button href="/market">Install component</Button>
    {/snippet}
  </PageHeader>

  <div class="home-blocks">
    <NeedsYouList
      approvals={needsYouApprovals}
      state={needsYouState}
      error={needsYouError}
      {nowMs}
      onRetry={() => void refreshNeedsYou()}
    />
    <RunningNow
      runs={runningNowRuns}
      state={runningNowState}
      error={runningNowError}
      {nowMs}
      onRetry={() => void refreshRunningNow()}
    />
  </div>

  <DataState
    state={dashboardState}
    {error}
    loadingTitle="Loading workspace"
    loadingDescription="Fetching instances and runtime status."
    emptyTitle="No instances installed yet."
    emptyDescription="Install a component to start running agents and workflows in this workspace."
    emptyActionLabel="Install component"
    emptyActionHref="/market"
    emptyIcon="plus"
    errorTitle="Unable to load workspace"
    retryLabel="Retry"
    onRetry={() => void refresh()}
  >
    <div class="instance-grid">
      {#each instanceEntries as { component, name, info } (`${component}:${name}`)}
        <InstanceCard
          {component}
          {name}
          version={info.version}
          status={info.status || "stopped"}
          autoStart={info.auto_start}
          port={info.port || 0}
          onAction={refresh}
        />
      {/each}
    </div>
  </DataState>
</div>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 0;
    max-width: none;
    margin: 0;
  }

  .home-blocks {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  @media (min-width: 64rem) {
    .home-blocks {
      grid-template-columns: 1fr 1fr;
    }
  }

  .instance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }
</style>
