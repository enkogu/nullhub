<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import InstanceCard from "$lib/components/InstanceCard.svelte";
  import { api, approvalsApi, charterApi, eventsApi, type Approval, type Charter, type CharterUpdateInput } from "$lib/api/client";
  import { pollWhileVisible } from "$lib/poll";
  import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
  import CharterCard, { type CharterCardState } from "$lib/components/charter/CharterCard.svelte";
  import DigestCard, { type DigestCardState } from "$lib/components/dashboard/DigestCard.svelte";
  import type { DigestEvent, DigestUsagePayload } from "$lib/components/dashboard/digest";
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

  // Home top blocks load independently — one failure must not blank the others.
  // Each block loads independently — one failure must not blank the other.
  let needsYouApprovals = $state<Approval[]>([]);
  let needsYouState = $state<NeedsYouListState>("idle");
  let needsYouError = $state<unknown>(null);
  let runningNowRuns = $state<LiveRun[]>([]);
  let runningNowState = $state<RunningNowState>("idle");
  let runningNowError = $state<unknown>(null);
  let digestEvents = $state<DigestEvent[]>([]);
  let digestUsage = $state<DigestUsagePayload | null>(null);
  let digestState = $state<DigestCardState>("idle");
  let digestError = $state<unknown>(null);
  let digestLastSeenMs = $state(Date.now() - 24 * 60 * 60_000);
  let nowMs = $state(Date.now());
  let stopNeedsYouPolling: (() => void) | null = null;
  let stopRunningNowPolling: (() => void) | null = null;
  let stopDigestPolling: (() => void) | null = null;
  let currentDigestSpaceId = $state<string | null | undefined>("__initial__");
  let charter = $state<Charter | null>(null);
  let charterState = $state<CharterCardState>("idle");
  let charterError = $state<unknown>(null);
  let charterRequestedSpaceId = $state<string | null>(null);
  let homeMounted = $state(false);
  let selectedSpaceName = $derived(spacesStore.selectedSpace?.name ?? "");

  function digestStorageKey() {
    return `nullhub.home_digest.last_seen.${spacesStore.selectedSpaceId || "all"}`;
  }

  function readDigestLastSeen() {
    if (typeof window === "undefined") return Date.now() - 24 * 60 * 60_000;
    const stored = Number(window.localStorage.getItem(digestStorageKey()));
    return Number.isFinite(stored) && stored > 0 ? stored : Date.now() - 24 * 60 * 60_000;
  }

  function rememberDigestSeen() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(digestStorageKey(), String(Date.now()));
  }

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

  async function refreshDigest() {
    try {
      // Client v1: spend is global while events are space-scoped and capped at limit:100, so long absences can undercount events.
      const [eventsPage, usage] = await Promise.all([
        eventsApi.listEvents({ limit: 100, spaceId: spacesStore.selectedSpaceId }),
        api.getGlobalUsage("7d"),
      ]);
      digestEvents = eventsPage.events;
      digestUsage = usage;
      digestState = "ready";
      digestError = null;
      rememberDigestSeen();
    } catch (e) {
      digestState = "error";
      digestError = e;
    }
  }

  function setCharterNoSpace(storeStatus = spacesStore.status) {
    charterRequestedSpaceId = null;
    charter = null;
    charterError = null;
    charterState = storeStatus === "ready" ? "empty" : "loading";
  }

  async function refreshCharter(spaceId = spacesStore.selectedSpaceId, storeStatus = spacesStore.status) {
    if (!spaceId) {
      setCharterNoSpace(storeStatus);
      return;
    }

    const requestSpaceId = spaceId;
    charterRequestedSpaceId = requestSpaceId;
    charter = null;
    charterError = null;
    charterState = "loading";

    try {
      const nextCharter = await charterApi.getCharter({ spaceId: requestSpaceId });
      if (charterRequestedSpaceId !== requestSpaceId) return;
      charter = nextCharter;
      charterState = "ready";
    } catch (e) {
      if (charterRequestedSpaceId !== requestSpaceId) return;
      charter = null;
      charterError = e;
      charterState = "error";
    }
  }

  async function saveCharter(input: CharterUpdateInput) {
    const spaceId = spacesStore.selectedSpaceId;
    if (!spaceId) throw new Error("Select a Space before editing its charter.");

    const saved = await charterApi.updateCharter({ ...input, spaceId });
    charterRequestedSpaceId = spaceId;
    charter = saved;
    charterState = "ready";
    charterError = null;
    return saved;
  }

  $effect(() => {
    const selectedSpaceId = spacesStore.selectedSpaceId;
    if (currentDigestSpaceId === selectedSpaceId) return;
    currentDigestSpaceId = selectedSpaceId;
    digestLastSeenMs = readDigestLastSeen();
  });

  $effect(() => {
    const selectedSpaceId = spacesStore.selectedSpaceId;
    const spacesStatus = spacesStore.status;
    if (!homeMounted) return;
    untrack(() => {
      void refreshCharter(selectedSpaceId, spacesStatus);
    });
  });

  onMount(() => {
    homeMounted = true;
    refreshTimer = setTimeout(() => void refresh(), 350);
    stopPolling = pollWhileVisible(refresh, 5000);
    needsYouState = "loading";
    runningNowState = "loading";
    digestState = "loading";
    void refreshNeedsYou();
    void refreshRunningNow();
    void refreshDigest();
    stopNeedsYouPolling = pollWhileVisible(refreshNeedsYou, 30_000);
    stopRunningNowPolling = pollWhileVisible(refreshRunningNow, 10_000);
    stopDigestPolling = pollWhileVisible(refreshDigest, 30_000);
  });

  onDestroy(() => {
    homeMounted = false;
    if (refreshTimer) clearTimeout(refreshTimer);
    stopPolling?.();
    stopNeedsYouPolling?.();
    stopRunningNowPolling?.();
    stopDigestPolling?.();
  });
</script>

<div class="dashboard">
  <PageHeader title="Home" subtitle="Current workspace state and runtime status.">
    {#snippet actions()}
      <Button href="/market">Install component</Button>
    {/snippet}
  </PageHeader>

  <div class="home-blocks">
    <div class="home-digest">
      <DigestCard
        events={digestEvents}
        usage={digestUsage}
        state={digestState}
        error={digestError}
        lastSeenMs={digestLastSeenMs}
        onRetry={() => void refreshDigest()}
      />
    </div>
    <CharterCard
      class="home-charter"
      {charter}
      state={charterState}
      error={charterError}
      spaceName={selectedSpaceName}
      onRetry={() => void refreshCharter()}
      onSave={saveCharter}
    />
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
      grid-template-columns: minmax(0, 1.2fr) minmax(20rem, 0.8fr);
    }
  }

  .instance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }
</style>
