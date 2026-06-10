<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nullBoilerApi } from '$lib/api/client';
  import { pollWhileVisible } from '$lib/poll';
  import { nullboilerUiRoutes } from '$lib/nullboiler/routes';
  import BoilerInstanceSelector from '$lib/components/nullboiler/BoilerInstanceSelector.svelte';
  import { Button } from '$lib/components/ui/button';
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from '$lib/entity-view';

  let runs = $state<any[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let offline = $state(false);
  let stats = $state({ active: 0, completed: 0, failed: 0, interrupted: 0 });

  const runColumns: EntityColumn[] = [
    { id: 'workflow', label: 'Workflow', type: 'text', width: 'minmax(180px,.75fr)' },
    { id: 'status', label: 'Status', type: 'status', width: 'minmax(120px,.38fr)' },
    { id: 'duration', label: 'Duration', type: 'mono', width: 'minmax(110px,.34fr)' },
    { id: 'created', label: 'Created', type: 'date', width: 'minmax(150px,.55fr)' },
  ];
  const runViews = createViewSet({
    kanban: { groupBy: 'status' },
    tree: { parentField: 'workflow' },
    timeline: { dateField: 'created' },
    calendar: { dateField: 'created' },
  });
  const runActions: EntityViewAction[] = [
    { id: 'open', label: 'Open', variant: 'default', href: (record) => record.href || '#' },
  ];
  let runRecords = $derived(
    runs.slice(0, 20).map((run) => ({
      id: `run:${run.id}`,
      title: String(run.id || '').slice(0, 8) || 'run',
      type: 'run',
      status: run.status || 'unknown',
      subtitle: run.workflow_name || run.workflow_id || '-',
      description: formatDuration(run),
      href: runHref(run.id),
      date: run.created_at || '',
      fields: {
        workflow: run.workflow_name || run.workflow_id || '-',
        status: run.status || 'unknown',
        duration: formatDuration(run),
        created: run.created_at || '',
      },
      raw: run,
    })) satisfies EntityRecord[],
  );

  function isOfflineError(message: string): boolean {
    const text = (message || '').toLowerCase();
    return (
      text.includes('unreachable') ||
      text.includes('offline') ||
      text.includes('econnrefused') ||
      text.includes('connection refused') ||
      text.includes('failed to fetch') ||
      text.includes('networkerror') ||
      text.includes('network error') ||
      /\b5\d\d\b/.test(text)
    );
  }

  async function loadRuns() {
    try {
      runs = await nullBoilerApi.listRuns() || [];
      stats = {
        active: runs.filter((r: any) => r.status === 'running' || r.status === 'pending').length,
        completed: runs.filter((r: any) => r.status === 'completed').length,
        failed: runs.filter((r: any) => r.status === 'failed').length,
        interrupted: runs.filter((r: any) => r.status === 'interrupted').length,
      };
      error = null;
      offline = false;
    } catch (e) {
      const message = (e as Error).message;
      if (isOfflineError(message)) {
        offline = true;
        error = null;
        runs = [];
        stats = { active: 0, completed: 0, failed: 0, interrupted: 0 };
      } else {
        offline = false;
        error = message;
      }
    } finally {
      loading = false;
    }
  }

  let stopPolling: (() => void) | null = null;
  onMount(() => {
    void loadRuns();
    stopPolling = pollWhileVisible(loadRuns, 5000);
  });
  onDestroy(() => stopPolling?.());

  function formatDuration(run: any): string {
    if (!run.created_at) return '-';
    const start = new Date(run.created_at).getTime();
    const end = run.completed_at ? new Date(run.completed_at).getTime() : Date.now();
    const secs = Math.floor((end - start) / 1000);
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  }

  function runHref(id: string): string {
    return nullboilerUiRoutes.run(id);
  }
</script>

<div class="page">
  <div class="cards">
    <div class="card">
      <div class="card-label">Active</div>
      <div class="card-value">{stats.active}</div>
    </div>
    <div class="card">
      <div class="card-label">Completed</div>
      <div class="card-value">{stats.completed}</div>
    </div>
    <div class="card">
      <div class="card-label">Failed</div>
      <div class="card-value">{stats.failed}</div>
    </div>
    <div class="card">
      <div class="card-label">Interrupted</div>
      <div class="card-value">{stats.interrupted}</div>
    </div>
  </div>

  <UniversalEntityView
    title="Recent Runs"
    description="Latest NullBoiler executions, grouped and browsable by status, workflow, and time."
    records={runRecords}
    columns={runColumns}
    views={runViews}
    defaultViewId="table"
    {loading}
    error={offline ? null : error}
    actions={runActions}
    emptyTitle={offline ? 'NullBoiler is offline' : 'No NullBoiler runs'}
    emptyDescription={offline
      ? 'Start the NullBoiler instance to load runs.'
      : 'Create a workflow to produce runs.'}
    onRefresh={loadRuns}
  >
    {#snippet headerControls()}
      <BoilerInstanceSelector onChange={() => { loading = true; error = null; offline = false; void loadRuns(); }} />
    {/snippet}
    {#snippet headerActions()}
      <Button variant="outline" size="sm" href={nullboilerUiRoutes.workflows()}>Workflows</Button>
      <Button variant="outline" size="sm" href={nullboilerUiRoutes.runs()}>Runs</Button>
    {/snippet}
  </UniversalEntityView>

  {#if !loading && !offline && runs.length === 0}
    <div class="footer-row">
      <Button href={nullboilerUiRoutes.workflows()} size="sm">Create a workflow</Button>
    </div>
  {/if}

  {#if runs.length > 20}
    <div class="footer-row">
      <Button variant="ghost" size="sm" href={nullboilerUiRoutes.runs()}>View all {runs.length} runs</Button>
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
  .cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
  }
  .card {
    background: var(--shadcn-card);
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 1rem 1.25rem;
  }
  .card-label {
    font-size: 0.75rem;
    color: var(--shadcn-muted-foreground);
    margin-bottom: 0.375rem;
  }
  .card-value {
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--shadcn-foreground);
  }
  .footer-row {
    display: flex;
    justify-content: center;
  }
  @media (max-width: 900px) {
    .cards { grid-template-columns: repeat(2, 1fr); }
  }
</style>
