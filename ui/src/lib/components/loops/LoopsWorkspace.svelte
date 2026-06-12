<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import TicketsInstanceSelector from "$lib/components/nulltickets/TicketsInstanceSelector.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Dialog } from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Tabs, TabsList, TabsTrigger } from "$lib/components/ui/tabs";
  import { getSelectedTicketsInstance } from "$lib/nullstack/backendSelection";
  import { loopRoutes } from "$lib/loops/routes";
  import { spacesStore } from "$lib/stores/spaces.svelte";
  import LoopGalleryPanel from "$lib/components/loops/LoopGalleryPanel.svelte";
  import { detailHref } from "$lib/components/loops/loopRunDetail";
  import StartLoopDialog from "$lib/components/loops/StartLoopDialog.svelte";
  import {
    badgeVariant,
    emptyLoopsState,
    formatDuration,
    formatMs,
    formatStatus,
    loadLoopsState,
    rowBucket,
    rowFailureReason,
    rowTime,
    ticketsComponent,
    workerId,
    type LoopsState,
    type TaskDetailCache,
  } from "$lib/loops/data";
  import { customLoopDefinition, installedTemplateSlugs, templateDefinition } from "$lib/loops/templates";
  import type { LoopTemplate } from "$lib/loops/builtins";
  import type { LoopRunRow, LoopSummary } from "$lib/loops/types";

  type WorkspaceTab = "overview" | "installed" | "gallery";

  let { initialTab = "overview" } = $props<{ initialTab?: WorkspaceTab }>();

  type ComponentSummary = {
    name: string;
    status: string;
    running: number;
    total: number;
    instanceName: string;
  };

  let status = $state<any>(null);
  let loopsState = $state<LoopsState>(emptyLoopsState());
  let providerHealth = $state<any>(null);
  let providerCheckedAt = 0;
  // svelte-ignore state_referenced_locally -- initialTab is intentionally an initial value
  let activeTab = $state<WorkspaceTab>(initialTab);
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state("");
  let message = $state("");
  let startDialogOpen = $state(false);
  let startPreselectedId = $state("");
  let customDialogOpen = $state(false);
  let customName = $state("");
  let customGoal = $state("");
  let installingSlug = $state("");
  let actionLoading = $state("");
  let requestSeq = 0;
  let loadInFlight = false;
  let detailCacheInstance = "";
  let interval: ReturnType<typeof setInterval> | undefined;
  const detailCache: TaskDetailCache = new Map();

  function summarizeComponent(componentName: string): ComponentSummary {
    const component = status?.components?.[componentName] || {};
    const instances = status?.instances?.[componentName] || {};
    const entry = Object.entries(instances)[0] as [string, any] | undefined;
    return {
      name: componentName,
      status: String(component.status || entry?.[1]?.status || "unknown"),
      running: Number(component.running || 0),
      total: Number(component.total || (entry ? 1 : 0)),
      instanceName: entry?.[0] || defaultInstanceName(componentName),
    };
  }

  function defaultInstanceName(componentName: string): string {
    if (componentName === "nulltickets") return "tickets";
    if (componentName === "nullboiler") return "boiler";
    return "claw";
  }

  function tickets(): ComponentSummary {
    return summarizeComponent("nulltickets");
  }

  function boiler(): ComponentSummary {
    return summarizeComponent("nullboiler");
  }

  function claw(): ComponentSummary {
    return summarizeComponent("nullclaw");
  }

  function isRunning(component: ComponentSummary): boolean {
    return component.running > 0 || ["ok", "running"].includes(component.status.toLowerCase());
  }

  function ticketsInstance(): string {
    return getSelectedTicketsInstance() || tickets().instanceName || "tickets";
  }

  function activeRows(): LoopRunRow[] {
    return loopsState.rows.filter((row) => rowBucket(row) === "active");
  }

  function attentionRows(): LoopRunRow[] {
    return loopsState.rows.filter((row) => rowBucket(row) === "attention");
  }

  function completedRows(): LoopRunRow[] {
    return loopsState.rows.filter((row) => rowBucket(row) === "completed");
  }

  function recentResults(): LoopRunRow[] {
    return [...completedRows()].sort((a, b) => rowTime(b) - rowTime(a)).slice(0, 6);
  }

  function recentProviderEvidence(): boolean {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return completedRows().some((row) => rowTime(row) >= oneHourAgo);
  }

  function providerReady(): boolean {
    if (!providerHealth) return isRunning(claw());
    return Boolean(providerHealth.live_ok || providerHealth.status === "ok" || recentProviderEvidence());
  }

  function systemIssue(): { title: string; detail: string; action: "instances" | "agents" | "worker" } | null {
    if (!status) return null;
    if (!isRunning(tickets())) {
      return {
        title: "Ticket store offline",
        detail: "Loops are ticket-backed. Start the NullTickets instance to see and run loops.",
        action: "instances",
      };
    }
    if (!isRunning(claw())) {
      return {
        title: "No agent gateway running",
        detail: "Loop tickets cannot be executed until a NullClaw instance is online.",
        action: "agents",
      };
    }
    if (providerHealth && !providerReady()) {
      return {
        title: "Agent provider not verified",
        detail: providerHealth?.reason || "Provider health has not passed yet, so runs may fail.",
        action: "agents",
      };
    }
    if (!isRunning(boiler()) && loopsState.queue.length > 0) {
      const count = loopsState.queue.length;
      return {
        title: "Worker paused",
        detail: `${count} waiting ticket${count === 1 ? "" : "s"} will not be claimed until the worker starts.`,
        action: "worker",
      };
    }
    return null;
  }

  async function refreshProviderHealth(force: boolean) {
    if (!isRunning(claw())) {
      providerHealth = null;
      providerCheckedAt = 0;
      return;
    }
    const now = Date.now();
    if (!force && providerHealth && now - providerCheckedAt < 60000) return;
    try {
      providerHealth = await api.getProviderHealth("nullclaw", claw().instanceName || "claw");
    } catch (e) {
      providerHealth = { live_ok: false, status: "error", reason: (e as Error).message };
    } finally {
      providerCheckedAt = Date.now();
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
      await refreshProviderHealth(!options.quiet);

      if (!isRunning(tickets())) {
        loopsState = emptyLoopsState();
        return;
      }

      const instance = ticketsInstance();
      const cacheScope = `${instance}:${spacesStore.selectedSpaceId ?? "all"}`;
      if (cacheScope !== detailCacheInstance) {
        detailCache.clear();
        detailCacheInstance = cacheScope;
      }
      const nextState = await loadLoopsState(instance, detailCache);
      if (seq !== requestSeq) return;
      loopsState = nextState;
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

  async function startWorker() {
    actionLoading = "worker";
    error = "";
    try {
      await api.startInstance("nullboiler", boiler().instanceName || "boiler", { launch_mode: "server" });
      message = "Worker started. Waiting tickets will be claimed shortly.";
      await loadAll({ quiet: true });
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = "";
    }
  }

  async function pauseWorker() {
    actionLoading = "worker";
    error = "";
    try {
      await api.stopInstance("nullboiler", boiler().instanceName || "boiler");
      message = "Worker paused. Loop state stays visible; tickets stop being claimed.";
      await loadAll({ quiet: true });
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = "";
    }
  }

  function openStartDialog(loop?: LoopSummary) {
    startPreselectedId = loop?.pipeline.id || "";
    startDialogOpen = true;
  }

  async function handleStartLoop(input: {
    pipelineId: string;
    title: string;
    description: string;
    priority: number;
    startWorker: boolean;
  }) {
    const loopName =
      loopsState.pipelines.find((pipeline) => pipeline.id === input.pipelineId)?.name || "loop";
    await api.nullTicketsCreateTask(ticketsComponent, ticketsInstance(), {
      pipeline_id: input.pipelineId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      metadata: { source: "nullhub-loops" },
    });
    if (input.startWorker) {
      await api.startInstance("nullboiler", boiler().instanceName || "boiler", { launch_mode: "server" });
    }
    message = `Ticket created in ${loopName}.`;
    activeTab = "overview";
    await loadAll({ quiet: true });
  }

  async function installTemplate(template: LoopTemplate) {
    installingSlug = template.slug;
    error = "";
    try {
      await api.nullTicketsCreatePipeline(ticketsComponent, ticketsInstance(), {
        name: template.slug,
        definition: templateDefinition(template),
      });
      message = `${template.name} installed. Start it from My Loops.`;
      await loadAll({ quiet: true });
      activeTab = "installed";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      installingSlug = "";
    }
  }

  async function createCustomLoop() {
    const name = customName.trim();
    if (!name) return;
    actionLoading = "custom";
    error = "";
    try {
      await api.nullTicketsCreatePipeline(ticketsComponent, ticketsInstance(), {
        name,
        definition: customLoopDefinition(customGoal.trim()),
      });
      message = `Loop ${name} created.`;
      customDialogOpen = false;
      customName = "";
      customGoal = "";
      await loadAll({ quiet: true });
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = "";
    }
  }

  function loopGoal(loop: LoopSummary): string {
    return loop.meta?.goal || loop.pipeline.definition?.states?.todo?.description || "";
  }

  function loopCounts(loop: LoopSummary): string {
    const parts = [`${loop.waiting} waiting`, `${loop.active} active`];
    if (loop.attention > 0) parts.push(`${loop.attention} need attention`);
    return parts.join(" · ");
  }

  function lastRunLabel(loop: LoopSummary): string {
    if (!loop.lastRow) return "no runs yet";
    return `${formatStatus(loop.lastRow.run.status)} · ${formatMs(rowTime(loop.lastRow))}`;
  }

  onMount(() => {
    void loadAll();
    interval = setInterval(() => void loadAll({ quiet: true }), 15000);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
</script>

<div class="loops-page">
  <PageHeader
    title="Loops"
    subtitle="Agents work tickets until the result passes."
    align="start"
  >
    {#snippet controls()}
      <TicketsInstanceSelector onChange={() => void loadAll()} />
    {/snippet}
    {#snippet actions()}
      <Button variant="outline" size="sm" onclick={() => loadAll()} disabled={refreshing}>
        {refreshing ? "Refreshing" : "Refresh"}
      </Button>
      <Button
        size="sm"
        onclick={() => openStartDialog()}
        disabled={!isRunning(tickets()) || loopsState.pipelines.length === 0}
      >
        Start Loop
      </Button>
    {/snippet}
  </PageHeader>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}
  {#if message}
    <div class="alert alert-success">{message}</div>
  {/if}

  {#if systemIssue()}
    {@const issue = systemIssue()!}
    <div class="alert alert-warning system-banner">
      <div>
        <strong>{issue.title}</strong>
        <span>{issue.detail}</span>
      </div>
      {#if issue.action === "instances"}
        <Button size="sm" href={loopRoutes.teamInstances}>Open Instances</Button>
      {:else if issue.action === "agents"}
        <Button size="sm" href={loopRoutes.teamAgents}>Open Agents</Button>
      {:else}
        <Button size="sm" onclick={startWorker} disabled={actionLoading === "worker"}>
          {actionLoading === "worker" ? "Starting" : "Start worker"}
        </Button>
      {/if}
    </div>
  {/if}

  <Tabs bind:value={activeTab}>
    <TabsList>
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="installed">My Loops</TabsTrigger>
      <TabsTrigger value="gallery">Gallery</TabsTrigger>
    </TabsList>
  </Tabs>

  {#if loading && !status}
    <Card class="empty-panel">Loading loops...</Card>
  {:else if activeTab === "gallery"}
    <LoopGalleryPanel
      installedSlugs={installedTemplateSlugs(loopsState.pipelines)}
      {installingSlug}
      oninstall={installTemplate}
    />
  {:else if !isRunning(tickets())}
    <Card class="empty-panel">
      <strong>Ticket store is offline</strong>
      <span>Loops are ticket-backed. Start the NullTickets instance to see installed loops and runs.</span>
      <Button href={loopRoutes.teamInstances} size="sm">Open Instances</Button>
    </Card>
  {:else if activeTab === "overview"}
    <div class="stat-row">
      <a class="stat-tile" class:alarm={attentionRows().length > 0} href={loopRoutes.runs({ filter: "attention" })}>
        <span>Needs attention</span>
        <strong>{attentionRows().length}</strong>
        <small>{attentionRows().length ? "failed, blocked, or stale runs" : "all clear"}</small>
      </a>
      <a class="stat-tile" href={loopRoutes.runs({ filter: "active" })}>
        <span>Running</span>
        <strong>{activeRows().length}</strong>
        <small>{activeRows().length ? "agents working now" : "nothing in progress"}</small>
      </a>
      <a class="stat-tile" href={loopRoutes.runs({ filter: "waiting" })}>
        <span>Waiting</span>
        <strong>{loopsState.queue.length}</strong>
        <small>{loopsState.queue.length ? "tickets ready to claim" : "queue is empty"}</small>
      </a>
      <a class="stat-tile" href={loopRoutes.runs({ filter: "completed" })}>
        <span>Completed</span>
        <strong>{completedRows().length}</strong>
        <small>recent runs that passed</small>
      </a>
    </div>

    {#if attentionRows().length > 0}
      <Card class="attention-panel">
        <div class="panel-head">
          <div>
            <h2>Needs attention</h2>
            <p>Runs that stopped before the exit condition passed.</p>
          </div>
          <Button variant="outline" size="sm" href={loopRoutes.runs({ filter: "attention" })}>Open all</Button>
        </div>
        <div class="compact-list">
          {#each attentionRows().slice(0, 5) as row (row.run.id)}
            <a class="list-item danger" href={detailHref(row, ticketsInstance(), spacesStore.selectedSpaceId)}>
              <div class="item-main">
                <strong>{row.task.title}</strong>
                <span>{row.pipeline?.name || "loop"} · {rowFailureReason(row)}</span>
              </div>
              <Badge variant={badgeVariant(row.run.status)}>{formatStatus(row.run.status)}</Badge>
            </a>
          {/each}
        </div>
      </Card>
    {/if}

    <section class="loops-section">
      <div class="section-head">
        <h2>My Loops</h2>
        <div class="section-actions">
          <Button variant="outline" size="sm" onclick={() => (customDialogOpen = true)}>New custom loop</Button>
          <Button variant="outline" size="sm" onclick={() => (activeTab = "gallery")}>Open Gallery</Button>
        </div>
      </div>
      {#if loopsState.loops.length === 0}
        <Card class="empty-panel">
          <strong>No loops installed yet</strong>
          <span>Install a loop from the Marketplace or Gallery, or create a custom one to put agents to work.</span>
          <Button size="sm" onclick={() => (activeTab = "gallery")}>Open Gallery</Button>
        </Card>
      {:else}
        <div class="loop-grid">
          {#each loopsState.loops.slice(0, 8) as loop (loop.pipeline.id)}
            <Card class="loop-card">
              <div class="loop-card-head">
                <strong>{loop.pipeline.name}</strong>
                {#if loop.meta?.category}
                  <Badge variant="muted">{loop.meta.category}</Badge>
                {/if}
              </div>
              {#if loopGoal(loop)}
                <p class="loop-goal">{loopGoal(loop)}</p>
              {/if}
              <div class="loop-meta">
                <span>{loopCounts(loop)}</span>
                <span class="loop-last">last: {lastRunLabel(loop)}</span>
              </div>
              <div class="loop-actions">
                <Button size="sm" onclick={() => openStartDialog(loop)}>Start</Button>
                <Button variant="outline" size="sm" href={loopRoutes.runs({ loop: loop.pipeline.id })}>Runs</Button>
              </div>
            </Card>
          {/each}
        </div>
        {#if loopsState.loops.length > 8}
          <Button variant="outline" size="sm" onclick={() => (activeTab = "installed")}>
            Show all {loopsState.loops.length} loops
          </Button>
        {/if}
      {/if}
    </section>

    <div class="overview-grid">
      <Card class="side-panel">
        <div class="panel-head">
          <div>
            <h2>Running now</h2>
            <p>Tickets agents are working at this moment.</p>
          </div>
        </div>
        {#if activeRows().length > 0}
          <div class="compact-list">
            {#each activeRows().slice(0, 5) as row (row.run.id)}
              <a class="list-item" href={detailHref(row, ticketsInstance(), spacesStore.selectedSpaceId)}>
                <div class="item-main">
                  <strong>{row.task.title}</strong>
                  <span>{row.pipeline?.name || "loop"} · {workerId(row)} · attempt {row.run.attempt || 1} · {formatDuration(row)}</span>
                </div>
                <Badge variant="warning">{formatStatus(row.run.status)}</Badge>
              </a>
            {/each}
          </div>
        {:else if loopsState.queue.length > 0}
          <div class="compact-list">
            {#each loopsState.queue.slice(0, 5) as task (task.id)}
              <div class="list-item">
                <div class="item-main">
                  <strong>{task.title}</strong>
                  <span>waiting to be claimed</span>
                </div>
                <Badge variant="warning">waiting</Badge>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-inline">Nothing running. Start a loop to put an agent to work.</div>
        {/if}
      </Card>

      <Card class="side-panel">
        <div class="panel-head">
          <div>
            <h2>Recent results</h2>
            <p>Latest runs that reached an exit state.</p>
          </div>
          <Button variant="outline" size="sm" href={loopRoutes.runs({ filter: "completed" })}>Open all</Button>
        </div>
        {#if recentResults().length > 0}
          <div class="compact-list">
            {#each recentResults() as row (row.run.id)}
              <a class="list-item" href={detailHref(row, ticketsInstance(), spacesStore.selectedSpaceId)}>
                <div class="item-main">
                  <strong>{row.task.title}</strong>
                  <span>{row.pipeline?.name || "loop"} · {formatMs(rowTime(row))}</span>
                </div>
                <Badge variant={badgeVariant(row.run.status)}>{formatStatus(row.run.status)}</Badge>
              </a>
            {/each}
          </div>
        {:else}
          <div class="empty-inline">Completed runs will show up here with their results.</div>
        {/if}
      </Card>
    </div>

    <div class="runtime-strip">
      <span class="runtime-label">Runtime</span>
      <span class="runtime-pill" class:online={isRunning(tickets())}>tickets</span>
      <span class="runtime-pill" class:online={isRunning(boiler())}>worker</span>
      <span class="runtime-pill" class:online={isRunning(claw())}>agents</span>
      <span class="runtime-pill" class:online={providerReady()}>provider</span>
      {#if isRunning(boiler())}
        <button class="runtime-action" onclick={pauseWorker} disabled={actionLoading === "worker"}>
          {actionLoading === "worker" ? "pausing..." : "pause worker"}
        </button>
      {:else if boiler().total > 0}
        <button class="runtime-action" onclick={startWorker} disabled={actionLoading === "worker"}>
          {actionLoading === "worker" ? "starting..." : "start worker"}
        </button>
      {/if}
      <a class="runtime-action" href={loopRoutes.teamInstances}>instances</a>
    </div>
  {:else}
    <section class="loops-section">
      <div class="section-head">
        <h2>Installed loops</h2>
        <div class="section-actions">
          <Button variant="outline" size="sm" onclick={() => (customDialogOpen = true)}>New custom loop</Button>
          <Button variant="outline" size="sm" onclick={() => (activeTab = "gallery")}>Open Gallery</Button>
        </div>
      </div>
      {#if loopsState.loops.length === 0}
        <Card class="empty-panel">
          <strong>No loops installed yet</strong>
          <span>Install a loop from the Marketplace or Gallery, or create a custom one to put agents to work.</span>
          <Button size="sm" onclick={() => (activeTab = "gallery")}>Open Gallery</Button>
        </Card>
      {:else}
        <div class="installed-list">
          {#each loopsState.loops as loop (loop.pipeline.id)}
            <Card class="installed-row">
              <div class="installed-main">
                <div class="installed-title">
                  <strong>{loop.pipeline.name}</strong>
                  {#if loop.meta?.category}
                    <Badge variant="muted">{loop.meta.category}</Badge>
                  {/if}
                  {#if loop.meta?.source === "builtin"}
                    <Badge variant="outline">built-in</Badge>
                  {/if}
                </div>
                {#if loopGoal(loop)}
                  <p class="loop-goal">{loopGoal(loop)}</p>
                {/if}
                <div class="loop-meta">
                  <span>{loopCounts(loop)} · {loop.done} done</span>
                  <span class="loop-last">last: {lastRunLabel(loop)}</span>
                </div>
              </div>
              <div class="loop-actions">
                <Button size="sm" onclick={() => openStartDialog(loop)}>Start</Button>
                <Button variant="outline" size="sm" href={loopRoutes.runs({ loop: loop.pipeline.id })}>Runs</Button>
              </div>
            </Card>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<StartLoopDialog
  bind:open={startDialogOpen}
  pipelines={loopsState.pipelines}
  preselectedId={startPreselectedId}
  workerRunning={isRunning(boiler())}
  onstart={handleStartLoop}
/>

<Dialog
  bind:open={customDialogOpen}
  title="New custom loop"
  description="Creates an empty loop. Start it with a ticket describing the work and the exit condition."
>
  <div class="field">
    <Label for="custom-loop-name">Name</Label>
    <Input id="custom-loop-name" bind:value={customName} placeholder="e.g. weekly-report-loop" />
  </div>
  <div class="field">
    <Label for="custom-loop-goal">Goal</Label>
    <Input id="custom-loop-goal" bind:value={customGoal} placeholder="What should this loop keep true?" />
  </div>
  {#snippet footer()}
    <Button variant="outline" size="sm" onclick={() => (customDialogOpen = false)}>Cancel</Button>
    <Button size="sm" onclick={createCustomLoop} disabled={actionLoading === "custom" || !customName.trim()}>
      {actionLoading === "custom" ? "Creating" : "Create loop"}
    </Button>
  {/snippet}
</Dialog>

<style>
  .loops-page {
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

  .alert-warning {
    border-color: rgb(253 230 138);
    background: rgb(255 251 235);
    color: rgb(146 64 14);
  }

  .alert-error {
    border-color: rgb(254 202 202);
    background: rgb(254 242 242);
    color: rgb(185 28 28);
  }

  .system-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .system-banner div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.15rem;
  }

  .system-banner strong {
    font-weight: 600;
  }

  .stat-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
  }

  .stat-tile {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.2rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0.875rem 1rem;
    background: var(--shadcn-card);
    color: inherit;
    text-decoration: none;
    transition: border-color 0.12s ease, background-color 0.12s ease;
  }

  .stat-tile:hover {
    border-color: var(--shadcn-ring);
  }

  .stat-tile.alarm {
    border-color: rgb(254 202 202);
    background: rgb(254 242 242);
  }

  .stat-tile span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .stat-tile strong {
    font-family: var(--font-mono);
    font-size: 1.75rem;
    line-height: 1.1;
  }

  .stat-tile small {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }

  :global(.attention-panel),
  :global(.side-panel) {
    min-width: 0;
    padding: 1rem;
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

  .panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.875rem;
  }

  .panel-head h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .panel-head p {
    margin: 0.15rem 0 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }

  .loops-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .section-head h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .section-actions {
    display: flex;
    gap: 0.5rem;
  }

  .loop-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
    gap: 0.75rem;
  }

  :global(.loop-card) {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.55rem;
    padding: 1rem;
  }

  .loop-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .loop-card-head strong {
    overflow: hidden;
    font-size: 0.9375rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .loop-goal {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .loop-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.8125rem;
  }

  .loop-meta span {
    color: var(--shadcn-muted-foreground);
  }

  .loop-actions {
    display: flex;
    margin-top: auto;
    gap: 0.5rem;
  }

  .installed-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  :global(.installed-row) {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 1rem;
  }

  .installed-main {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.3rem;
  }

  .installed-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .installed-title strong {
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: 0.75rem;
  }

  .compact-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    padding: 0.55rem 0.75rem;
    color: inherit;
    text-decoration: none;
  }

  a.list-item:hover {
    border-color: var(--shadcn-ring);
  }

  .list-item.danger {
    border-color: rgb(254 202 202);
    background: rgb(254 242 242);
  }

  .item-main {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.1rem;
  }

  .item-main strong {
    overflow: hidden;
    font-size: 0.875rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-main span {
    overflow: hidden;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-inline {
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }

  .runtime-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }

  .runtime-label {
    font-weight: 600;
  }

  .runtime-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border: 1px solid var(--shadcn-border);
    border-radius: 999px;
    padding: 0.1rem 0.6rem;
  }

  .runtime-pill::before {
    content: "";
    height: 0.45rem;
    width: 0.45rem;
    border-radius: 999px;
    background: rgb(248 113 113);
  }

  .runtime-pill.online::before {
    background: rgb(52 211 153);
  }

  .runtime-action {
    border: 0;
    background: none;
    padding: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    text-decoration: underline;
    cursor: pointer;
  }

  .runtime-action:hover {
    color: var(--shadcn-foreground);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
</style>
