<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { pollWhileVisible } from "$lib/poll";
  import { getSelectedTicketsInstance, setSelectedTicketsInstance } from "$lib/nullstack/backendSelection";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import TicketsInstanceSelector from "$lib/components/nulltickets/TicketsInstanceSelector.svelte";
  import TaskRow, { type WorkTask } from "./TaskRow.svelte";
  import QuickAddTask, { type PipelineOption } from "./QuickAddTask.svelte";
  import type { DelegateOption } from "./DelegateDropdown.svelte";

  type Pipeline = {
    id?: string;
    name?: string;
  };

  type InstanceState = Record<string, any>;

  let status = $state<any>(null);
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let selectedInstance = $state("");
  let pipelines = $state<Pipeline[]>([]);
  let tasks = $state<WorkTask[]>([]);
  let stopPolling: (() => void) | null = null;
  let statusLoading = false;

  const nullTicketsInstances = $derived((status?.instances?.nulltickets || {}) as InstanceState);
  const nullClawInstances = $derived((status?.instances?.nullclaw || {}) as InstanceState);
  const ticketsInstanceEntries = $derived(Object.entries(nullTicketsInstances).sort(([a], [b]) => a.localeCompare(b)));
  const agentOptions = $derived(
    Object.entries(nullClawInstances)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, info]) => ({
        value: name,
        label: `${name}${info?.status ? ` · ${String(info.status)}` : ""}`,
        status: String(info?.status || "unknown"),
      })) satisfies DelegateOption[],
  );
  const pipelineOptions = $derived(
    pipelines
      .map((pipeline) => ({
        value: String(pipeline.id || pipeline.name || ""),
        label: String(pipeline.name || pipeline.id || "pipeline"),
      }))
      .filter((pipeline) => pipeline.value) satisfies PipelineOption[],
  );
  const activeInstance = $derived(resolveActiveInstance());
  const pipelineNameById = $derived(
    Object.fromEntries(
      pipelineOptions.map((pipeline) => [pipeline.value, pipeline.label]),
    ) as Record<string, string>,
  );

  function resolveActiveInstance(): string {
    if (selectedInstance && nullTicketsInstances[selectedInstance]) return selectedInstance;
    const stored = getSelectedTicketsInstance();
    if (stored && nullTicketsInstances[stored]) return stored;
    const running = ticketsInstanceEntries.find(([, info]) => String(info?.status || "").toLowerCase() === "running");
    const fallback = ticketsInstanceEntries.find(([name]) => name === "default") || ticketsInstanceEntries[0];
    return String((running || fallback || [""])[0] || "");
  }

  function startOfDay(value: number): number {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 0;
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  function startOfWeek(value: number): number {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 0;
    const day = date.getDay() || 7;
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (day - 1));
    return date.getTime();
  }

  function taskSort(a: WorkTask, b: WorkTask): number {
    const priorityDiff = Number(b.priority || 0) - Number(a.priority || 0);
    if (priorityDiff) return priorityDiff;
    return Number(b.updated_at_ms || b.created_at_ms || 0) - Number(a.updated_at_ms || a.created_at_ms || 0);
  }

  function groupTasks() {
    const now = Date.now();
    const today = startOfDay(now);
    const week = startOfWeek(now);
    const todayTasks: WorkTask[] = [];
    const weekTasks: WorkTask[] = [];

    for (const task of [...tasks].sort(taskSort)) {
      const ts = Number(task.updated_at_ms || task.created_at_ms || 0);
      if (ts >= today) todayTasks.push(task);
      else if (ts >= week) weekTasks.push(task);
    }

    return { today: todayTasks, week: weekTasks };
  }

  const groupedTasks = $derived(groupTasks());

  async function loadWorkspace(showLoading = false) {
    if (statusLoading) return;
    statusLoading = true;
    if (showLoading || !status) loading = true;
    refreshing = true;
    try {
      const nextStatus = await api.getStatus();
      status = nextStatus;
      error = null;

      if (!selectedInstance) selectedInstance = getSelectedTicketsInstance();
      const resolved = resolveActiveInstance();
      if (resolved !== selectedInstance) {
        selectedInstance = resolved;
        setSelectedTicketsInstance(resolved);
      }

      if (!resolved) {
        pipelines = [];
        tasks = [];
        return;
      }

      const [nextPipelines, nextTasks] = await Promise.all([
        api.nullTicketsPipelines("nulltickets", resolved),
        api.nullTicketsTasks("nulltickets", resolved, { limit: 50 }),
      ]);
      pipelines = Array.isArray(nextPipelines) ? nextPipelines : [];
      tasks = Array.isArray(nextTasks?.items) ? nextTasks.items : [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
      refreshing = false;
      statusLoading = false;
    }
  }

  async function createTask(payload: {
    pipelineId: string;
    title: string;
    description: string;
    priority: number;
    delegateAgentId: string;
  }) {
    if (!activeInstance) throw new Error("Select a NullTickets backend first.");
    await api.nullTicketsCreateTask("nulltickets", activeInstance, {
      pipeline_id: payload.pipelineId,
      title: payload.title,
      description: payload.description,
      priority: payload.priority,
      metadata: {},
      ...(payload.delegateAgentId
        ? { assigned_agent_id: payload.delegateAgentId, assigned_by: "nullhub" }
        : {}),
    });
    await loadWorkspace(false);
  }

  function handleInstanceChange(instanceName: string) {
    selectedInstance = instanceName;
    setSelectedTicketsInstance(instanceName);
    void loadWorkspace(true);
  }

  function pipelineLabel(task: WorkTask): string {
    return pipelineNameById[String(task.pipeline_id || "")] || String(task.pipeline_id || "-");
  }

  onMount(() => {
    selectedInstance = getSelectedTicketsInstance();
    void loadWorkspace(true);
    stopPolling = pollWhileVisible(() => loadWorkspace(false), 5000);
  });

  onDestroy(() => {
    stopPolling?.();
  });
</script>

<div class="work-today">
  <PageHeader title="Today" subtitle="Live execution, quick intake, and delegated work for the selected NullTickets backend.">
    {#snippet controls()}
      <TicketsInstanceSelector label="NullTickets backend" onChange={handleInstanceChange} />
    {/snippet}
    {#snippet actions()}
      <Button variant="outline" size="sm" onclick={() => void loadWorkspace(true)} disabled={loading || refreshing}>
        {refreshing ? "Refreshing…" : "Refresh"}
      </Button>
    {/snippet}
  </PageHeader>

  {#if error}
    <div class="banner banner-error">{error}</div>
  {/if}

  <section class="summary-strip" aria-label="Work summary">
    <Card class="summary-card">
      <span>Tasks today</span>
      <strong>{groupedTasks.today.length}</strong>
    </Card>
    <Card class="summary-card">
      <span>This week</span>
      <strong>{groupedTasks.week.length}</strong>
    </Card>
    <Card class="summary-card">
      <span>Pipelines</span>
      <strong>{pipelineOptions.length}</strong>
    </Card>
    <Card class="summary-card">
      <span>Delegates</span>
      <strong>{agentOptions.length}</strong>
    </Card>
  </section>

  <QuickAddTask
    pipelines={pipelineOptions}
    agents={agentOptions}
    busy={loading || refreshing}
    disabled={!activeInstance}
    onSubmit={createTask}
  />

  {#if loading && tasks.length === 0}
    <Card class="empty-card">
      <p>Loading Today tasks…</p>
    </Card>
  {:else}
    <section class="task-groups">
      <div class="task-group">
        <div class="group-head">
          <h2>Today</h2>
          <Badge variant="outline">{groupedTasks.today.length}</Badge>
        </div>
        {#if groupedTasks.today.length === 0}
          <Card class="empty-card">
            <p>No tasks updated today.</p>
          </Card>
        {:else}
          <div class="task-list">
            {#each groupedTasks.today as task (task.id)}
              <TaskRow task={task} pipelineName={pipelineLabel(task)} bucket="Today" />
            {/each}
          </div>
        {/if}
      </div>

      <div class="task-group">
        <div class="group-head">
          <h2>This week</h2>
          <Badge variant="outline">{groupedTasks.week.length}</Badge>
        </div>
        {#if groupedTasks.week.length === 0}
          <Card class="empty-card">
            <p>No other tasks landed in this week bucket yet.</p>
          </Card>
        {:else}
          <div class="task-list">
            {#each groupedTasks.week as task (task.id)}
              <TaskRow task={task} pipelineName={pipelineLabel(task)} bucket="This week" />
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  .work-today {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .banner {
    padding: 0.75rem 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: 0.5rem;
    background: var(--shadcn-muted);
    font-size: 0.875rem;
  }

  .banner-error {
    border-color: var(--shadcn-destructive);
    color: var(--shadcn-destructive);
    background: color-mix(in srgb, var(--shadcn-destructive) 8%, transparent);
  }

  .summary-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .summary-card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.9rem 1rem;
  }

  .summary-card span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8rem;
  }

  .summary-card strong {
    color: var(--shadcn-foreground);
    font-size: 1.25rem;
    font-weight: 600;
  }

  .task-groups {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .task-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .group-head h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .task-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .empty-card {
    padding: 1rem;
  }

  .empty-card p {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }

  @media (max-width: 960px) {
    .summary-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .summary-strip {
      grid-template-columns: 1fr;
    }
  }
</style>
