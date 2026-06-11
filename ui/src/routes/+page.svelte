<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import InstanceCard from "$lib/components/InstanceCard.svelte";
  import { api } from "$lib/api/client";
  import { pollWhileVisible } from "$lib/poll";
  import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
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

  onMount(() => {
    refreshTimer = setTimeout(() => void refresh(), 350);
    stopPolling = pollWhileVisible(refresh, 5000);
  });

  onDestroy(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
    stopPolling?.();
  });
</script>

<div class="dashboard">
  <PageHeader title="Home" subtitle="Current workspace state and runtime status.">
    {#snippet actions()}
      <Button href="/market">Install component</Button>
    {/snippet}
  </PageHeader>

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

  .instance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }
</style>
