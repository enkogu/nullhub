<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import {
    getSelectedTicketsInstance,
    setSelectedTicketsInstance,
  } from "$lib/nullstack/backendSelection";
  import NullTicketsPanel from "../NullTicketsPanel.svelte";
  import TicketsInstanceSelector from "./TicketsInstanceSelector.svelte";

  type PanelView = "tasks" | "pipelines" | "queue" | "runs" | "artifacts";
  type WorkMode = "tasks" | "planner" | "dependencies";

  let {
    title,
    subtitle = "",
    initialView = "tasks",
    initialArtifactScope = "selected",
    views = [],
    workMode = "tasks",
  } = $props<{
    title: string;
    subtitle?: string;
    initialView?: PanelView;
    initialArtifactScope?: "selected" | "custom" | "all";
    views?: readonly PanelView[];
    workMode?: WorkMode;
  }>();

  let status = $state<any>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let selectedInstance = $state("");
  let interval: ReturnType<typeof setInterval> | null = null;
  let statusLoading = false;

  const panelViews = $derived(
    views.length ? [...views] : ["tasks", "pipelines", "queue", "runs", "artifacts"],
  );
  const ticketsInstances = $derived((status?.instances?.nulltickets || {}) as Record<string, any>);
  const instanceEntries = $derived(
    Object.entries(ticketsInstances).sort(([a], [b]) => a.localeCompare(b)),
  );
  const targetName = $derived(resolveTargetName());
  const targetInfo = $derived(targetName ? ticketsInstances[targetName] : null);
  const targetRunning = $derived(targetInfo?.status === "running");

  function resolveTargetName(): string {
    if (selectedInstance && ticketsInstances[selectedInstance]) return selectedInstance;
    const runningEntry = instanceEntries.find(([, info]) => info?.status === "running");
    const defaultEntry = instanceEntries.find(([instanceName]) => instanceName === "default");
    return String((runningEntry || defaultEntry || instanceEntries[0] || [""])[0] || "");
  }

  async function refreshStatus(showLoading = false) {
    if (statusLoading) return;
    statusLoading = true;
    if (showLoading || !status) loading = true;
    try {
      const nextStatus = await api.getStatus();
      const nextTickets = (nextStatus?.instances?.nulltickets || {}) as Record<string, any>;
      const storedSelection = selectedInstance || getSelectedTicketsInstance();
      status = nextStatus;
      error = null;
      if (storedSelection && !nextTickets[storedSelection]) {
        selectedInstance = "";
        setSelectedTicketsInstance("");
      } else if (!selectedInstance && storedSelection) {
        selectedInstance = storedSelection;
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
      statusLoading = false;
    }
  }

  function handleTicketsInstanceChange(instanceName: string) {
    selectedInstance = instanceName;
    void refreshStatus(true);
  }

  onMount(() => {
    selectedInstance = getSelectedTicketsInstance();
    void refreshStatus(true);
    interval = setInterval(() => void refreshStatus(false), 5000);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
</script>

<div class="tickets-workspace">
  <div class="tickets-toolbar">
    <TicketsInstanceSelector label="NullTickets backend" onChange={handleTicketsInstanceChange} />
    <button class="btn" onclick={() => refreshStatus(true)} disabled={loading}>
      {loading ? "Refreshing..." : "Refresh backend"}
    </button>
  </div>

  {#if error}
    <div class="error-banner">ERR: {error}</div>
  {/if}

  {#if loading && !status}
    <div class="empty-state">Loading NullTickets backend...</div>
  {:else if instanceEntries.length === 0}
    <div class="empty-state">No NullTickets instances installed.</div>
  {:else if targetName}
    <NullTicketsPanel
      component="nulltickets"
      name={targetName}
      active={true}
      running={targetRunning}
      {title}
      {subtitle}
      {initialView}
      {initialArtifactScope}
      {workMode}
      views={panelViews}
    />
  {/if}
</div>

<style>
  .tickets-workspace {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 1rem;
  }

  .tickets-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--shadcn-border);
  }

  .btn {
    min-height: 2.25rem;
    padding: 0.5rem 0.875rem;
    border: 1px solid var(--shadcn-input);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .btn:hover:not(:disabled) {
    background: var(--shadcn-accent);
  }

  .btn:disabled {
    opacity: 0.6;
  }

  .error-banner,
  .empty-state {
    padding: 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
  }

  .error-banner {
    color: var(--shadcn-destructive);
    border-color: color-mix(in srgb, var(--shadcn-destructive) 25%, var(--shadcn-border));
  }

  .empty-state {
    color: var(--shadcn-muted-foreground);
  }
</style>
