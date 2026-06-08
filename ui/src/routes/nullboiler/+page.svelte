<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nullBoilerApi } from '$lib/api/client';
  import { nullboilerUiRoutes } from '$lib/nullboiler/routes';
  import BoilerInstanceSelector from '$lib/components/nullboiler/BoilerInstanceSelector.svelte';
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
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  let interval: ReturnType<typeof setInterval>;
  onMount(() => {
    void loadRuns();
    interval = setInterval(loadRuns, 5000);
  });
  onDestroy(() => clearInterval(interval));

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

<div class="dashboard">
  <div class="header">
    <h1>NullBoiler</h1>
    <div class="header-actions">
      <BoilerInstanceSelector onChange={() => { loading = true; error = null; void loadRuns(); }} />
      <a href={nullboilerUiRoutes.workflows()} class="action-btn">Workflows</a>
      <a href={nullboilerUiRoutes.runs()} class="action-btn">Runs</a>
    </div>
  </div>

  {#if error}
    <div class="error-banner">ERR: {error}</div>
  {/if}

  <div class="cards">
    <div class="card">
      <div class="card-label">Active</div>
      <div class="card-value" style="color: var(--accent); text-shadow: 0 0 8px var(--accent);">{stats.active}</div>
    </div>
    <div class="card">
      <div class="card-label">Completed</div>
      <div class="card-value" style="color: var(--success); text-shadow: 0 0 8px var(--success);">{stats.completed}</div>
    </div>
    <div class="card">
      <div class="card-label">Failed</div>
      <div class="card-value" style="color: var(--error); text-shadow: 0 0 8px var(--error);">{stats.failed}</div>
    </div>
    <div class="card">
      <div class="card-label">Interrupted</div>
      <div class="card-value" style="color: var(--warning); text-shadow: 0 0 8px var(--warning);">{stats.interrupted}</div>
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
    actions={runActions}
    emptyTitle="No NullBoiler runs"
    emptyDescription="Create a workflow to produce runs."
    onRefresh={loadRuns}
  />

  {#if !loading && runs.length === 0}
    <a href={nullboilerUiRoutes.workflows()} class="btn">Create a Workflow</a>
  {/if}

  {#if runs.length > 20}
    <div class="more-link">
      <a href={nullboilerUiRoutes.runs()}>View all {runs.length} runs</a>
    </div>
  {/if}
</div>

<style>
  .dashboard {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  h1 {
    font-size: 1.75rem;
    font-weight: 700;
    text-shadow: var(--text-glow);
    text-transform: uppercase;
    letter-spacing: 2px;
  }
  .action-btn {
    padding: 0.5rem 1rem;
    background: var(--bg-surface);
    color: var(--accent);
    border: 1px solid var(--accent-dim);
    border-radius: var(--radius);
    font-size: 0.875rem;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease, transform 0.2s ease, text-shadow 0.2s ease;
    text-shadow: var(--text-glow);
  }
  .action-btn:hover {
    text-decoration: none;
    background: var(--bg-hover);
    border-color: var(--accent);
    box-shadow: 0 0 10px var(--border-glow);
    text-shadow: 0 0 8px var(--accent);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1.25rem;
  }
  .card-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--fg-dim);
    margin-bottom: 0.5rem;
  }
  .card-value {
    font-size: 2rem;
    font-weight: 700;
    font-family: var(--font-mono);
  }
  .error-banner {
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--error) 10%, transparent);
    color: var(--error);
    border: 1px solid var(--error);
    border-radius: 4px;
    margin-bottom: 1.5rem;
    font-size: 0.875rem;
    font-weight: bold;
    text-shadow: 0 0 5px var(--error);
    box-shadow: 0 0 10px color-mix(in srgb, var(--error) 20%, transparent);
  }
  .btn {
    display: inline-block;
    align-self: flex-start;
    padding: 0.75rem 1.5rem;
    background: var(--bg-surface);
    color: var(--accent);
    border: 1px solid var(--accent-dim);
    border-radius: var(--radius);
    font-size: 0.875rem;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease, transform 0.2s ease, text-shadow 0.2s ease;
    text-shadow: var(--text-glow);
  }
  .btn:hover {
    text-decoration: none;
    background: var(--bg-hover);
    border-color: var(--accent);
    box-shadow: 0 0 10px var(--border-glow);
    text-shadow: 0 0 8px var(--accent);
  }
  .more-link {
    text-align: center;
    padding: 0.75rem;
  }
  .more-link a {
    color: var(--accent);
    font-size: 0.8125rem;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .more-link a:hover {
    text-shadow: var(--text-glow);
  }
  @media (max-width: 900px) {
    .cards { grid-template-columns: repeat(2, 1fr); }
  }
</style>
