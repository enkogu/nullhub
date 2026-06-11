<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import BoilerInstanceSelector from "$lib/components/nullboiler/BoilerInstanceSelector.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Tabs, TabsList, TabsTrigger } from "$lib/components/ui/tabs";
  import LoopRunDetailPanel from "./LoopRunDetailPanel.svelte";
  import {
    detailWorkerInstance,
    entryBadge,
    entryBucket,
    entryStatus,
    entryTime,
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
  let loadInFlight = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  const detailCache: TaskDetailCache = new Map();
  const agentResultCache = new Map<string, AgentResult | null>();

  function ticketsRunning(): boolean {
    const component = status?.components?.nulltickets || {};
    return Number(component.running || 0) > 0 || ["ok", "running"].includes(String(component.status || "").toLowerCase());
  }

  function ticketsInstance(): string {
    const instances = status?.instances?.nulltickets || {};
    return Object.keys(instances)[0] || "tickets";
  }

  function clawInstance(): string {
    const instances = status?.instances?.nullclaw || {};
    return Object.keys(instances)[0] || "claw";
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
      return;
    }
    const runId = entry.run.id;
    if (detailLoadedForRun === runId && entryBucket(entry) !== "active") {
      return;
    }
    try {
      const [eventsResult, artifactsResult] = await Promise.all([
        api.nullTicketsRunEvents(ticketsComponent, ticketsInstance(), runId, { limit: 30 }),
        api.nullTicketsArtifacts(ticketsComponent, ticketsInstance(), { runId, taskId: entry.task.id, limit: 12 }),
      ]);
      if (selectedEntry()?.run?.id !== runId) return;
      detail = {
        events: Array.isArray(eventsResult?.items) ? eventsResult.items : [],
        artifacts: Array.isArray(artifactsResult?.items) ? artifactsResult.items : [],
      };
      detailLoadedForRun = runId;
    } catch (e) {
      if (selectedEntry()?.run?.id === runId) {
        detail = { events: [], artifacts: [] };
        error = (e as Error).message;
      }
    }
    void loadAgentResult(entry);
  }

  async function loadAgentResult(entry: RunEntry) {
    if (!entry.run?.id) return;
    const instanceName = detailWorkerInstance(detail.events, entry, clawInstance());
    const cacheKey = `${instanceName}:${entry.task.id}`;
    if (agentResultCache.has(cacheKey)) {
      agentResult = agentResultCache.get(cacheKey) || null;
      agentResultLoading = false;
      return;
    }
    agentResultLoading = true;
    agentResult = null;
    const taskId = entry.task.id;
    try {
      const sessionList = await api.getHistory("nullclaw", instanceName, { limit: 12 });
      const sessions = Array.isArray(sessionList?.sessions) ? sessionList.sessions : [];
      const sessionIds = sessions
        .map((session: any) => session.session_id)
        .filter((sessionId: unknown): sessionId is string => Boolean(sessionId))
        .sort((a: string, b: string) => Number(b.startsWith("webhook:")) - Number(a.startsWith("webhook:")));
      if (!sessionIds.includes("webhook:local-nullboiler-worker")) {
        sessionIds.push("webhook:local-nullboiler-worker");
      }

      for (const sessionId of sessionIds.slice(0, 4)) {
        const history = await api.getHistory("nullclaw", instanceName, { sessionId, limit: 100 });
        const messages = Array.isArray(history?.messages) ? history.messages : [];
        for (let index = 0; index < messages.length; index += 1) {
          const current = messages[index];
          if (current.role !== "user" || !String(current.content || "").includes(taskId)) continue;
          const assistant = messages.slice(index + 1).find((candidate: any) => candidate.role === "assistant");
          if (!assistant?.content) continue;
          const result = {
            instanceName,
            sessionId,
            content: assistant.content,
            createdAt: assistant.created_at,
          };
          agentResultCache.set(cacheKey, result);
          if (selectedEntry()?.task.id === taskId) agentResult = result;
          return;
        }
      }
      agentResultCache.set(cacheKey, null);
      if (selectedEntry()?.task.id === taskId) agentResult = null;
    } catch (e) {
      if (selectedEntry()?.task.id === taskId) agentResultError = (e as Error).message;
    } finally {
      if (selectedEntry()?.task.id === taskId) agentResultLoading = false;
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
      const statusResult = await api.getStatus();
      if (seq !== requestSeq) return;
      status = statusResult;
      if (!ticketsRunning()) {
        loopsState = emptyLoopsState();
        return;
      }
      const nextState = await loadLoopsState(ticketsInstance(), detailCache);
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
      <BoilerInstanceSelector onChange={() => void loadAll()} />
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
