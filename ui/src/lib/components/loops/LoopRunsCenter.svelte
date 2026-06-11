<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import TicketsInstanceSelector from "$lib/components/nulltickets/TicketsInstanceSelector.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Tabs, TabsList, TabsTrigger } from "$lib/components/ui/tabs";
  import { getSelectedTicketsInstance } from "$lib/nullstack/backendSelection";
  import { spacesStore } from "$lib/stores/spaces.svelte";
  import LoopRunDetailPanel from "./LoopRunDetailPanel.svelte";
  import {
    detailWorkerInstance,
    entryBadge,
    entryBucket,
    entryStatus,
    entryTime,
    loadLoopAgentResult,
    loopName,
    type LoopAgentResult as AgentResult,
    type LoopRunDetailData as RunDetail,
    type LoopRunDetailEntry as RunEntry,
  } from "./loopRunDetail";
  import {
    attemptNumber,
    emptyLoopsState,
    formatMs,
    loadLoopsState,
    ticketsComponent,
    type LoopsState,
    type TaskDetailCache,
  } from "$lib/loops/data";
  import type { LoopRunRow } from "$lib/loops/types";

  type RunsFilter = "all" | "active" | "waiting" | "attention" | "completed";

  let status = $state<any>(null);
  let loopsState = $state<LoopsState>(emptyLoopsState());
  let filter = $state<RunsFilter>("all");
  let loopFilter = $state("");
  let selectedTaskId = $state("");
  let selectionPinned = false;
  let detail = $state<RunDetail>({ events: [], artifacts: [] });
  let detailLoadedForRun = $state("");
  let agentResult = $state<AgentResult | null>(null);
  let agentResultLoading = $state(false);
  let agentResultError = $state("");
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state("");
  let message = $state("");
  let actionLoading = $state("");
  let requestSeq = 0;
  let detailRequestSeq = 0;
  let loadInFlight = false;
  let detailCacheScope = "";
  let interval: ReturnType<typeof setInterval> | undefined;
  const detailCache: TaskDetailCache = new Map();
  const agentResultCache = new Map<string, AgentResult | null>();

  function ticketsRunning(): boolean {
    const component = status?.components?.nulltickets || {};
    const instances = status?.instances?.nulltickets || {};
    const instanceRunning = Object.values(instances).some((info: any) => {
      const state = String(info?.status || "").toLowerCase();
      return Number(info?.running || 0) > 0 || ["ok", "running"].includes(state);
    });
    return (
      instanceRunning ||
      Number(component.running || 0) > 0 ||
      ["ok", "running"].includes(String(component.status || "").toLowerCase())
    );
  }

  function ticketsInstance(): string {
    const instances = status?.instances?.nulltickets || {};
    const selected = getSelectedTicketsInstance();
    if (selected && instances[selected]) return selected;
    return Object.keys(instances)[0] || "tickets";
  }

  function clawInstance(): string {
    const instances = status?.instances?.nullclaw || {};
    return Object.keys(instances)[0] || "claw";
  }

  function clawInstances(): string[] {
    return Object.keys(status?.instances?.nullclaw || {});
  }

  function runEntries(): RunEntry[] {
    const rows: RunEntry[] = loopsState.rows.map((row) => ({ task: row.task, run: row.run, pipeline: row.pipeline }));
    const waiting: RunEntry[] = loopsState.queue.map((task) => ({
      task,
      pipeline: loopsState.pipelines.find((pipeline) => pipeline.id === task.pipeline_id),
    }));
    return [...rows, ...waiting];
  }

  function filteredEntries(): RunEntry[] {
    return runEntries()
      .filter((entry) => !loopFilter || entry.task.pipeline_id === loopFilter)
      .filter((entry) => filter === "all" || entryBucket(entry) === filter)
      .sort((a, b) => entryTime(b) - entryTime(a));
  }

  function filterCount(target: RunsFilter): number {
    return runEntries()
      .filter((entry) => !loopFilter || entry.task.pipeline_id === loopFilter)
      .filter((entry) => target === "all" || entryBucket(entry) === target).length;
  }

  function selectedEntry(): RunEntry | undefined {
    const entries = filteredEntries();
    if (selectedTaskId) {
      const pinned = entries.find((entry) => entry.task.id === selectedTaskId);
      if (pinned) return pinned;
      if (selectionPinned) {
        const anywhere = runEntries().find((entry) => entry.task.id === selectedTaskId);
        if (anywhere) return anywhere;
      }
    }
    return entries[0];
  }

  function loopFilterName(): string {
    return loopsState.pipelines.find((pipeline) => pipeline.id === loopFilter)?.name || loopFilter.slice(0, 8);
  }

  function detailScopeFor(runId: string): string {
    return `${ticketsInstance()}:${spacesStore.selectedSpaceId ?? "all"}:${runId}`;
  }

  function detailScopeStillCurrent(scope: string, runId: string, seq: number): boolean {
    return detailRequestSeq === seq && detailScopeFor(runId) === scope && selectedEntry()?.run?.id === runId;
  }

  function selectEntry(entry: RunEntry) {
    selectedTaskId = entry.task.id;
    selectionPinned = true;
    void loadDetail(entry);
  }

  function setFilter(next: RunsFilter) {
    filter = next;
    if (!selectionPinned) selectedTaskId = "";
    void loadDetail(selectedEntry());
  }

  async function loadDetail(entry?: RunEntry) {
    agentResultError = "";
    if (!entry?.run?.id) {
      detail = { events: [], artifacts: [] };
      detailLoadedForRun = "";
      agentResult = null;
      agentResultLoading = false;
      return;
    }
    const runId = entry.run.id;
    const detailScope = detailScopeFor(runId);
    if (detailLoadedForRun === detailScope && entryBucket(entry) !== "active") {
      return;
    }
    const detailSeq = ++detailRequestSeq;
    try {
      const [eventsResult, artifactsResult] = await Promise.all([
        api.nullTicketsRunEvents(ticketsComponent, ticketsInstance(), runId, { limit: 30 }),
        api.nullTicketsArtifacts(ticketsComponent, ticketsInstance(), { runId, taskId: entry.task.id, limit: 12 }),
      ]);
      if (!detailScopeStillCurrent(detailScope, runId, detailSeq)) return;
      detail = {
        events: Array.isArray(eventsResult?.items) ? eventsResult.items : [],
        artifacts: Array.isArray(artifactsResult?.items) ? artifactsResult.items : [],
      };
      detailLoadedForRun = detailScope;
    } catch (e) {
      if (detailScopeStillCurrent(detailScope, runId, detailSeq)) {
        detail = { events: [], artifacts: [] };
        error = (e as Error).message;
      } else {
        return;
      }
    }
    void loadAgentResult(entry, detailScope, detailSeq);
  }

  async function loadAgentResult(entry: RunEntry, expectedScope?: string, expectedSeq?: number) {
    if (!entry.run?.id) return;
    const runId = entry.run.id;
    const detailSeq = expectedSeq ?? detailRequestSeq;
    const detailScope = expectedScope ?? detailScopeFor(runId);
    if (!detailScopeStillCurrent(detailScope, runId, detailSeq)) return;
    const instanceName = detailWorkerInstance(detail.events, entry, clawInstance(), clawInstances());
    const cacheKey = `${ticketsInstance()}:${spacesStore.selectedSpaceId ?? "all"}:${instanceName}:${entry.task.id}:${entry.run.id}`;
    if (agentResultCache.has(cacheKey)) {
      if (!detailScopeStillCurrent(detailScope, runId, detailSeq)) return;
      agentResult = agentResultCache.get(cacheKey) || null;
      agentResultLoading = false;
      return;
    }
    agentResultLoading = true;
    agentResult = null;
    try {
      const result = await loadLoopAgentResult(api, entry, detail.events, clawInstance(), clawInstances());
      agentResultCache.set(cacheKey, result);
      if (detailScopeStillCurrent(detailScope, runId, detailSeq)) agentResult = result;
    } catch (e) {
      if (detailScopeStillCurrent(detailScope, runId, detailSeq)) agentResultError = (e as Error).message;
    } finally {
      if (detailScopeStillCurrent(detailScope, runId, detailSeq)) agentResultLoading = false;
    }
  }

  async function runAgain(entry: RunEntry) {
    actionLoading = "again";
    error = "";
    try {
      await api.nullTicketsCreateTask(ticketsComponent, ticketsInstance(), {
        pipeline_id: entry.task.pipeline_id,
        title: entry.task.title,
        description: entry.task.description || "",
        priority: entry.task.priority || 50,
        metadata: { source: "nullhub-loops", retry_of: entry.task.id },
      });
      message = `New ticket created in ${loopName(entry)}.`;
      await loadAll({ quiet: true });
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = "";
    }
  }

  async function loadAll(options: { quiet?: boolean } = {}) {
    if (loadInFlight) return;
    loadInFlight = true;
    const seq = ++requestSeq;
    if (!options.quiet) loading = true;
    refreshing = true;
    error = "";
    try {
      const [statusResult, instancesResult] = await Promise.all([api.getStatus(), api.getInstances()]);
      if (seq !== requestSeq) return;
      status = {
        ...statusResult,
        instances: instancesResult?.instances || statusResult?.instances || {},
      };
      if (!ticketsRunning()) {
        loopsState = emptyLoopsState();
        return;
      }
      const instance = ticketsInstance();
      const cacheScope = `${instance}:${spacesStore.selectedSpaceId ?? "all"}`;
      if (cacheScope !== detailCacheScope) {
        detailCache.clear();
        agentResultCache.clear();
        detailRequestSeq += 1;
        detailLoadedForRun = "";
        detail = { events: [], artifacts: [] };
        agentResult = null;
        detailCacheScope = cacheScope;
      }
      const nextState = await loadLoopsState(instance, detailCache);
      if (seq !== requestSeq) return;
      loopsState = nextState;
      void loadDetail(selectedEntry());
    } catch (e) {
      if (seq === requestSeq) error = (e as Error).message;
    } finally {
      loadInFlight = false;
      if (seq === requestSeq) {
        loading = false;
        refreshing = false;
      }
    }
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedFilter = params.get("filter") as RunsFilter | null;
    if (requestedFilter && ["all", "active", "waiting", "attention", "completed"].includes(requestedFilter)) {
      filter = requestedFilter;
    }
    loopFilter = params.get("loop") || "";
    const requestedRun = params.get("run");
    void loadAll().then(() => {
      if (requestedRun) {
        const entry = runEntries().find((candidate) => candidate.run?.id === requestedRun);
        if (entry) selectEntry(entry);
      }
    });
    interval = setInterval(() => void loadAll({ quiet: true }), 15000);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
</script>

<div class="runs-page">
  <PageHeader
    title="Loop Runs"
    subtitle="Every attempt agents make on loop tickets, with evidence and results."
    align="start"
  >
    {#snippet controls()}
      <TicketsInstanceSelector onChange={() => void loadAll()} />
    {/snippet}
    {#snippet actions()}
      <Button variant="outline" size="sm" onclick={() => loadAll()} disabled={refreshing}>
        {refreshing ? "Refreshing" : "Refresh"}
      </Button>
      <Button size="sm" href="/loops">Open Loops</Button>
    {/snippet}
  </PageHeader>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}
  {#if message}
    <div class="alert alert-success">{message}</div>
  {/if}

  {#if loopFilter}
    <div class="loop-filter-chip">
      <span>Loop: <strong>{loopFilterName()}</strong></span>
      <button onclick={() => (loopFilter = "")}>clear</button>
    </div>
  {/if}

  <Tabs bind:value={() => filter, (value) => setFilter(value as RunsFilter)}>
    <TabsList>
      <TabsTrigger value="all">All · {filterCount("all")}</TabsTrigger>
      <TabsTrigger value="active">Active · {filterCount("active")}</TabsTrigger>
      <TabsTrigger value="waiting">Waiting · {filterCount("waiting")}</TabsTrigger>
      <TabsTrigger value="attention">Needs attention · {filterCount("attention")}</TabsTrigger>
      <TabsTrigger value="completed">Completed · {filterCount("completed")}</TabsTrigger>
    </TabsList>
  </Tabs>

  {#if loading && !status}
    <Card class="empty-panel">Loading loop runs...</Card>
  {:else if !ticketsRunning()}
    <Card class="empty-panel">
      <strong>Ticket store is offline</strong>
      <span>Loop runs are stored in NullTickets. Start the instance to inspect run history.</span>
      <Button href="/inventory/instances" size="sm">Open Instances</Button>
    </Card>
  {:else if filteredEntries().length === 0}
    <Card class="empty-panel">
      <strong>No runs in this view</strong>
      <span>Start a loop from the Loops page and run attempts will appear here.</span>
      <Button href="/loops" size="sm">Open Loops</Button>
    </Card>
  {:else}
    <div class="runs-grid">
      <Card class="runs-list">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Ticket</th>
                <th>Loop</th>
                <th>Attempt</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredEntries().slice(0, 30) as entry (entry.task.id)}
                <tr class:selected={selectedEntry()?.task.id === entry.task.id} onclick={() => selectEntry(entry)}>
                  <td><Badge variant={entryBadge(entry)}>{entryStatus(entry)}</Badge></td>
                  <td class="title-cell">{entry.task.title}</td>
                  <td class="muted-cell">{loopName(entry)}</td>
                  <td class="muted-cell">{entry.run ? attemptNumber(entry as LoopRunRow) : "-"}</td>
                  <td class="muted-cell">{formatMs(entryTime(entry))}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Card>

      <LoopRunDetailPanel
        entry={selectedEntry()}
        {detail}
        {agentResult}
        {agentResultLoading}
        {agentResultError}
        {actionLoading}
        onRunAgain={(entry) => runAgain(entry)}
      />
    </div>
  {/if}
</div>

<style>
  .runs-page {
    display: flex;
    min-width: 0;
    max-width: 100%;
    flex-direction: column;
    gap: 1rem;
  }

  .alert {
    border-radius: var(--shadcn-radius);
    border: 1px solid var(--shadcn-border);
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
  }

  .alert-success {
    border-color: rgb(167 243 208);
    background: rgb(236 253 245);
    color: rgb(4 120 87);
  }

  .alert-error {
    border-color: rgb(254 202 202);
    background: rgb(254 242 242);
    color: rgb(185 28 28);
  }

  .loop-filter-chip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--shadcn-muted-foreground);
  }

  .loop-filter-chip button {
    border: 0;
    background: none;
    padding: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    text-decoration: underline;
    cursor: pointer;
  }

  :global(.empty-panel) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 1.25rem;
  }

  :global(.empty-panel) span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }

  .runs-grid {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: 0.75rem;
    align-items: start;
  }

  @media (max-width: 1100px) {
    .runs-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  :global(.runs-list) {
    min-width: 0;
    padding: 0.5rem;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  th {
    padding: 0.5rem 0.625rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  td {
    padding: 0.5rem 0.625rem;
    border-top: 1px solid var(--shadcn-border);
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover {
    background: var(--shadcn-accent);
  }

  tbody tr.selected {
    background: var(--shadcn-accent);
  }

  .title-cell {
    max-width: 22rem;
    overflow: hidden;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .muted-cell {
    color: var(--shadcn-muted-foreground);
    white-space: nowrap;
  }

</style>
