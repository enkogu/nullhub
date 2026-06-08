<script lang="ts">
  import { nullBoilerApi } from "$lib/api/client";
  import { nullboilerUiRoutes } from "$lib/nullboiler/routes";
  import BoilerInstanceSelector from "$lib/components/nullboiler/BoilerInstanceSelector.svelte";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";

  let runs = $state<any[]>([]);
  let workflows = $state<any[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state<string | null>(null);

  let filterStatus = $state("");
  let filterWorkflow = $state("");
  let runLimit = $state("50");
  let hasMore = $state(false);
  let nextOffset = $state<number | null>(null);
  let runsQueryKey = $state("");

  const statuses = ["", "running", "pending", "completed", "failed", "interrupted", "cancelled"];
  const runColumns: EntityColumn[] = [
    { id: "workflow", label: "Workflow", type: "select", width: "minmax(180px,.72fr)" },
    { id: "status", label: "Status", type: "status", width: "minmax(120px,.4fr)" },
    { id: "duration", label: "Duration", type: "mono", width: "minmax(110px,.36fr)" },
    { id: "created", label: "Created", type: "date", width: "minmax(150px,.56fr)" },
    { id: "completed", label: "Completed", type: "date", width: "minmax(150px,.56fr)" },
  ];
  const runViews = createViewSet({
    kanban: { groupBy: "status" },
    tree: { parentField: "workflow_id" },
    timeline: { dateField: "created" },
    calendar: { dateField: "created" },
  });
  const runActions: EntityViewAction[] = [
    { id: "open", label: "Open", variant: "default", href: (record) => record.href || "#" },
  ];

  const runRecords = $derived(
    runs.map((run) => {
      const id = String(run.id || "");
      const workflowName = run.workflow_name || run.workflow_id || "-";
      return {
        id: `run:${id}`,
        title: id.slice(0, 12) || "run",
        type: "run",
        status: run.status || "unknown",
        subtitle: workflowName,
        description: formatDuration(run),
        href: runHref(id),
        date: run.created_at || "",
        fields: {
          id,
          workflow: workflowName,
          workflow_id: run.workflow_id || workflowName,
          status: run.status || "unknown",
          duration: formatDuration(run),
          created: run.created_at || "",
          completed: run.completed_at || "",
        },
        raw: run,
      };
    }) satisfies EntityRecord[],
  );

  function boundedInt(raw: string, fallback: number, min: number, max: number): number {
    const value = Number.parseInt(raw || String(fallback), 10);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  function queryKey(): string {
    return JSON.stringify({
      status: filterStatus || "",
      workflow: filterWorkflow || "",
      limit: boundedInt(runLimit, 50, 1, 250),
    });
  }

  async function loadData(append = false) {
    if (append) loadingMore = true;
    else loading = true;
    try {
      const key = queryKey();
      const canAppend = append && runsQueryKey === key && nextOffset !== null;
      const [page, w] = await Promise.all([
        nullBoilerApi.listRunsPage({
          status: filterStatus || undefined,
          workflow_id: filterWorkflow || undefined,
          limit: boundedInt(runLimit, 50, 1, 250),
          offset: canAppend ? nextOffset || 0 : 0,
        }),
        nullBoilerApi.listWorkflows(),
      ]);
      const nextItems = page?.items || [];
      if (canAppend) {
        const seen = new Set(runs.map((run: any) => run.id));
        runs = [...runs, ...nextItems.filter((run: any) => !seen.has(run.id))];
      } else {
        runs = nextItems;
      }
      runsQueryKey = key;
      hasMore = Boolean(page?.hasMore && typeof page?.nextOffset === "number");
      nextOffset = hasMore ? page.nextOffset || 0 : null;
      workflows = w || [];
      error = null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      if (append) loadingMore = false;
      else loading = false;
    }
  }

  $effect(() => {
    filterStatus;
    filterWorkflow;
    runLimit;
    void loadData();
  });

  function formatDuration(run: any): string {
    if (!run.created_at) return "-";
    const start = new Date(run.created_at).getTime();
    const end = run.completed_at ? new Date(run.completed_at).getTime() : Date.now();
    const secs = Math.max(0, Math.floor((end - start) / 1000));
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  }

  function runHref(id: string): string {
    return nullboilerUiRoutes.run(id);
  }
</script>

<div class="page">
  <div class="topbar">
    <BoilerInstanceSelector onChange={() => { error = null; void loadData(); }} />
  </div>

  <div class="filter-bar">
    <label>
      <span>Status</span>
      <select bind:value={filterStatus}>
        {#each statuses as status}
          <option value={status}>{status || "All"}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Workflow</span>
      <select bind:value={filterWorkflow}>
        <option value="">All</option>
        {#each workflows as workflow}
          <option value={workflow.id}>{workflow.name || workflow.id}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Limit</span>
      <input bind:value={runLimit} inputmode="numeric" />
    </label>
  </div>

  <UniversalEntityView
    title="Runs"
    description="Execution history from the selected NullBoiler instance."
    records={runRecords}
    columns={runColumns}
    views={runViews}
    defaultViewId="table"
    {loading}
    {error}
    actions={runActions}
    emptyTitle="No runs"
    emptyDescription="No runs match the current filter."
    onRefresh={loadData}
  />

  {#if hasMore}
    <div class="load-more-row">
      <button type="button" class="load-more" onclick={() => loadData(true)} disabled={loadingMore}>
        {loadingMore ? "Loading" : "Load More"}
      </button>
    </div>
  {/if}
</div>

<style>
  .page {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
  }

  .topbar {
    display: flex;
    justify-content: flex-end;
  }

  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0.75rem;
    background: var(--shadcn-card);
  }

  .filter-bar label {
    display: grid;
    gap: 0.35rem;
    min-width: 10rem;
  }

  .filter-bar span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .filter-bar select,
  .filter-bar input {
    min-height: 2.25rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0 0.625rem;
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    font: inherit;
    font-size: 0.875rem;
  }

  .filter-bar input {
    width: 6rem;
  }

  .load-more-row {
    display: flex;
    justify-content: center;
  }

  .load-more {
    min-height: 2.25rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0 0.875rem;
    background: var(--shadcn-secondary);
    color: var(--shadcn-secondary-foreground);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .load-more:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
</style>
