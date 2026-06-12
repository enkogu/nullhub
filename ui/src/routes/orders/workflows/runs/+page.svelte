<script lang="ts">
  import { nullBoilerApi } from "$lib/api/client";
  import { isCircuitBreakerError } from "$lib/components/DataState.svelte";
  import { nullboilerUiRoutes } from "$lib/nullboiler/routes";
  import BoilerInstanceSelector from "$lib/components/nullboiler/BoilerInstanceSelector.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Select } from "$lib/components/ui/select";
  import { Input } from "$lib/components/ui/input";
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
  let error = $state<unknown>(null);
  let offline = $state(false);

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

  function isOfflineError(message: string): boolean {
    const text = (message || "").toLowerCase();
    return (
      text.includes("unreachable") ||
      text.includes("offline") ||
      text.includes("econnrefused") ||
      text.includes("connection refused") ||
      text.includes("failed to fetch") ||
      text.includes("networkerror") ||
      text.includes("network error") ||
      /\b5\d\d\b/.test(text)
    );
  }

  function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "";
  }

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
      offline = false;
    } catch (e) {
      const message = errorMessage(e);
      if (isCircuitBreakerError(e)) {
        offline = false;
        error = e;
      } else if (isOfflineError(message)) {
        offline = true;
        error = null;
        if (!append) {
          runs = [];
          hasMore = false;
          nextOffset = null;
        }
      } else {
        offline = false;
        error = e || message;
      }
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
  <UniversalEntityView
    title="Runs"
    description="Execution history from the selected NullBoiler instance."
    records={runRecords}
    columns={runColumns}
    views={runViews}
    defaultViewId="table"
    {loading}
    error={offline ? null : error}
    actions={runActions}
    emptyTitle={offline ? "NullBoiler is offline" : "No runs"}
    emptyDescription={offline
      ? "Start the NullBoiler instance to load runs."
      : "No runs match the current filter."}
    onRefresh={loadData}
  >
    {#snippet headerControls()}
      <BoilerInstanceSelector onChange={() => { error = null; offline = false; void loadData(); }} />
      <Select bind:value={filterStatus} class="filter-select" aria-label="Filter by status">
        {#each statuses as status}
          <option value={status}>{status || "All statuses"}</option>
        {/each}
      </Select>
      <Select bind:value={filterWorkflow} class="filter-select" aria-label="Filter by workflow">
        <option value="">All workflows</option>
        {#each workflows as workflow}
          <option value={workflow.id}>{workflow.name || workflow.id}</option>
        {/each}
      </Select>
      <Input bind:value={runLimit} inputmode="numeric" class="filter-limit" aria-label="Result limit" placeholder="Limit" />
    {/snippet}
  </UniversalEntityView>

  {#if hasMore}
    <div class="load-more-row">
      <Button variant="secondary" size="sm" onclick={() => loadData(true)} disabled={loadingMore}>
        {loadingMore ? "Loading" : "Load more"}
      </Button>
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

  .page :global(.filter-select) {
    width: auto;
    min-width: 9rem;
  }

  .page :global(.filter-limit) {
    width: 5rem;
  }

  .load-more-row {
    display: flex;
    justify-content: center;
  }
</style>
