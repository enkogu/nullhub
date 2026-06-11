<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import LoopRunDetailPanel from "$lib/components/loops/LoopRunDetailPanel.svelte";
  import {
    loadLoopAgentResult,
    type LoopAgentResult,
    type LoopRunDetailData,
    type LoopRunDetailEntry,
  } from "$lib/components/loops/loopRunDetail";
  import TicketsInstanceSelector from "$lib/components/nulltickets/TicketsInstanceSelector.svelte";
  import WorkTabs from "$lib/components/work/WorkTabs.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { PageHeader } from "$lib/components/ui/page-header";
  import {
    loadLoopsState,
    ticketsComponent,
    type LoopsState,
    type TaskDetailCache,
  } from "$lib/loops/data";
  import type { LoopTask } from "$lib/loops/types";
  import { getSelectedTicketsInstance, setSelectedTicketsInstance } from "$lib/nullstack/backendSelection";
  import { spacesStore } from "$lib/stores/spaces.svelte";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  type LoadState = "loading" | "ready" | "empty" | "error";
  type LoadRunOptions = { quiet?: boolean; ticketsInstanceOverride?: string };

  let mounted = false;
  let loadState = $state<LoadState>("loading");
  let refreshing = $state(false);
  let error = $state("");
  let entry = $state<LoopRunDetailEntry | null>(null);
  let detail = $state<LoopRunDetailData>({ events: [], artifacts: [] });
  let agentResult = $state<LoopAgentResult | null>(null);
  let agentResultLoading = $state(false);
  let agentResultError = $state("");
  let ticketsInstance = $state(getSelectedTicketsInstance());
  let requestSeq = 0;
  let detailCacheScope = "";
  const detailCache: TaskDetailCache = new Map();

  let runId = $derived($page.params.id);
  let selectedSpaceKey = $derived(`${$page.url.searchParams.get("space") || ""}:${spacesStore.selectedSpaceId ?? "all"}`);
  let routeKey = $derived(
    `${runId}:${$page.url.searchParams.get("task_id") || ""}:${$page.url.searchParams.get("tickets_instance") || ""}:${selectedSpaceKey}`,
  );
  let loopRunsHref = $derived.by(() => {
    const params = new URLSearchParams();
    if (ticketsInstance) params.set("tickets_instance", ticketsInstance);
    if (spacesStore.selectedSpaceId) params.set("space", spacesStore.selectedSpaceId);
    const query = params.toString();
    return `/work/loops/runs${query ? `?${query}` : ""}`;
  });
  let loopRunsForRunHref = $derived.by(() => {
    const url = new URL(loopRunsHref, "http://nullhub.local");
    url.searchParams.set("run", runId);
    return `${url.pathname}${url.search}`;
  });

  function componentInstances(instancesResult: any, component: string): Record<string, any> {
    return instancesResult?.instances?.[component] || {};
  }

  function instanceNames(instancesResult: any, component: string): string[] {
    return Object.keys(componentInstances(instancesResult, component));
  }

  function firstRunningInstance(instancesResult: any, component: string, fallback: string): string {
    const instances = componentInstances(instancesResult, component);
    const running = Object.entries(instances).find(([, info]: [string, any]) => info?.status === "running");
    return running?.[0] || Object.keys(instances)[0] || fallback;
  }

  function firstTicketsInstance(instancesResult: any): string {
    return firstRunningInstance(instancesResult, "nulltickets", "tickets");
  }

  async function resolveTicketsInstance(override?: string): Promise<string> {
    if (override) {
      ticketsInstance = override;
      return override;
    }
    if (override === "") {
      const instances = await api.getInstances();
      const resolved = firstTicketsInstance(instances);
      ticketsInstance = resolved;
      return resolved;
    }
    const selected = getSelectedTicketsInstance();
    if (selected) {
      ticketsInstance = selected;
      if ($page.url.searchParams.get("tickets_instance") === selected) setSelectedTicketsInstance(selected);
      return selected;
    }
    const instances = await api.getInstances();
    const resolved = firstTicketsInstance(instances);
    ticketsInstance = resolved;
    return resolved;
  }

  async function loadTaskEntry(instance: string, state: LoopsState, taskId: string): Promise<LoopRunDetailEntry | null> {
    if (!taskId) {
      const row = state.rows.find((candidate) => candidate.run.id === runId);
      return row ? { task: row.task, run: row.run, pipeline: row.pipeline } : null;
    }
    let task: LoopTask | null = null;
    try {
      task = await api.nullTicketsGetTask(ticketsComponent, instance, taskId);
    } catch {
      task = state.tasks.find((candidate) => candidate.id === taskId) || null;
    }
    if (!task) return null;
    const run = task.latest_run && task.latest_run.id === runId
      ? task.latest_run
      : { id: runId, task_id: task.id, status: "unknown" };
    return {
      task,
      run,
      pipeline: state.pipelines.find((pipeline) => pipeline.id === task.pipeline_id),
    };
  }

  function syncDetailCacheScope(instance: string) {
    const scope = `${instance}:${selectedSpaceKey}`;
    if (scope === detailCacheScope) return;
    detailCache.clear();
    detailCacheScope = scope;
  }

  async function loadAgentResultForRun(seq: number, nextEntry: LoopRunDetailEntry, nextDetail: LoopRunDetailData) {
    const hasRunScopedAgent = Boolean(
      nextEntry.run?.agent_id ||
      nextDetail.events.some((event) => typeof event.data?.worker_id === "string" && event.data.worker_id.trim()),
    );
    if (!hasRunScopedAgent) return;
    agentResultLoading = true;
    agentResult = null;
    agentResultError = "";
    try {
      let instancesResult: any = null;
      try {
        instancesResult = await api.getInstances();
      } catch {
        instancesResult = null;
      }
      if (seq !== requestSeq) return;
      const result = await loadLoopAgentResult(
        api,
        nextEntry,
        nextDetail.events,
        firstRunningInstance(instancesResult, "nullclaw", "claw"),
        instanceNames(instancesResult, "nullclaw"),
      );
      if (seq !== requestSeq) return;
      agentResult = result;
    } catch (e) {
      if (seq === requestSeq) agentResultError = (e as Error).message;
    } finally {
      if (seq === requestSeq) agentResultLoading = false;
    }
  }

  async function loadRun(options: LoadRunOptions = {}) {
    const seq = ++requestSeq;
    if (!options.quiet) loadState = "loading";
    refreshing = true;
    error = "";
    agentResult = null;
    agentResultLoading = false;
    agentResultError = "";
    try {
      const instance = await resolveTicketsInstance(options.ticketsInstanceOverride);
      syncDetailCacheScope(instance);
      const nextLoopsState = await loadLoopsState(instance, detailCache);
      if (seq !== requestSeq) return;
      const taskId = $page.url.searchParams.get("task_id") || "";
      const nextEntry = await loadTaskEntry(instance, nextLoopsState, taskId);
      if (seq !== requestSeq) return;
      if (!nextEntry?.run?.id) {
        entry = null;
        detail = { events: [], artifacts: [] };
        agentResult = null;
        agentResultLoading = false;
        agentResultError = "";
        loadState = "empty";
        return;
      }

      const [eventsResult, artifactsResult] = await Promise.all([
        api.nullTicketsRunEvents(ticketsComponent, instance, nextEntry.run.id, { limit: 100 }),
        api.nullTicketsArtifacts(ticketsComponent, instance, { runId: nextEntry.run.id, taskId: nextEntry.task.id, limit: 50 }),
      ]);
      if (seq !== requestSeq) return;
      entry = nextEntry;
      const nextDetail = {
        events: Array.isArray(eventsResult?.items) ? eventsResult.items : [],
        artifacts: Array.isArray(artifactsResult?.items) ? artifactsResult.items : [],
      };
      detail = nextDetail;
      loadState = "ready";
      void loadAgentResultForRun(seq, nextEntry, nextDetail);
    } catch (e) {
      if (seq === requestSeq) {
        error = (e as Error).message;
        loadState = "error";
        agentResult = null;
        agentResultLoading = false;
        agentResultError = "";
      }
    } finally {
      if (seq === requestSeq) refreshing = false;
    }
  }

  function handleTicketsChange(name: string) {
    ticketsInstance = name;
    setSelectedTicketsInstance(name);
    void loadRun({ ticketsInstanceOverride: name });
  }

  $effect(() => {
    routeKey;
    if (mounted) void loadRun();
  });

  onMount(() => {
    mounted = true;
    void loadRun();
    return () => {
      mounted = false;
    };
  });
</script>

<div class="space-y-5">
  <WorkTabs />

  <PageHeader title="Run Detail" subtitle={entry ? `${entry.task.title} · ${runId}` : `Loop run ${runId}`}>
    {#snippet controls()}
      <TicketsInstanceSelector label="NullTickets" onChange={handleTicketsChange} />
    {/snippet}
    {#snippet actions()}
      <Button variant="outline" size="sm" onclick={() => void loadRun()} disabled={refreshing}>
        <RefreshCwIcon class="size-4" aria-hidden="true" />
        {refreshing ? "Refreshing" : "Refresh"}
      </Button>
      <Button variant="outline" size="sm" href={loopRunsHref}>All loop runs</Button>
    {/snippet}
  </PageHeader>

  {#if loadState === "loading"}
    <Card class="state-card">Loading run detail...</Card>
  {:else if loadState === "error"}
    <Card class="state-card error">
      <strong>Run detail unavailable</strong>
      <span>{error || "The run detail could not be loaded."}</span>
      <Button variant="outline" size="sm" onclick={() => void loadRun()}>Retry</Button>
    </Card>
  {:else if loadState === "empty" || !entry}
    <Card class="state-card">
      <strong>Run context needed</strong>
      <span>This route needs a matching task context because NullTickets does not expose a run lookup by ID.</span>
      <Button variant="outline" size="sm" href={loopRunsForRunHref}>Open in loop runs</Button>
    </Card>
  {:else}
    <LoopRunDetailPanel {entry} {detail} {agentResult} {agentResultLoading} {agentResultError} />
  {/if}
</div>

<style>
  :global(.state-card) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 1rem;
  }

  :global(.state-card span) {
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }

  :global(.state-card.error) {
    border-color: rgb(254 202 202);
    background: rgb(254 242 242);
    color: rgb(185 28 28);
  }
</style>
