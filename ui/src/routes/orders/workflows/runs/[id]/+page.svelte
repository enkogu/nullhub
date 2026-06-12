<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { pollWhileVisible } from '$lib/poll';
  import { nullBoilerApi } from '$lib/api/client';
  import { nullboilerUiRoutes } from '$lib/nullboiler/routes';
  import GraphViewer from '$lib/components/nullboiler/GraphViewer.svelte';
  import StateInspector from '$lib/components/nullboiler/StateInspector.svelte';
  import RunEventLog from '$lib/components/nullboiler/RunEventLog.svelte';
  import InterruptPanel from '$lib/components/nullboiler/InterruptPanel.svelte';
  import BoilerInstanceSelector from '$lib/components/nullboiler/BoilerInstanceSelector.svelte';
  import { PageHeader } from '$lib/components/ui/page-header';
  import { Button } from '$lib/components/ui/button';
  import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
  import CircleXIcon from '@lucide/svelte/icons/circle-x';
  import GitForkIcon from '@lucide/svelte/icons/git-fork';
  import type { RunStreamHandle } from '$lib/api/nullboiler';

  let id = $derived($page.params.id);

  let run = $state<any>(null);
  let workflow = $state<any>({ nodes: {}, edges: [] });
  let events = $state<any[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let nodeStatus = $state<Record<string, string>>({});
  let previousState = $state<any>(null);
  let runStream: RunStreamHandle | null = null;
  let stopPolling: (() => void) | null = null;

  async function loadRun() {
    try {
      const data = await nullBoilerApi.getRun(id);
      previousState = run?.state || null;
      run = data;
      if (data.workflow) {
        workflow = data.workflow;
      } else if (data.workflow_id) {
        try {
          workflow = await nullBoilerApi.getWorkflow(data.workflow_id);
        } catch { /* keep current */ }
      }
      // Build node status map
      const ns: Record<string, string> = {};
      if (data.steps) {
        for (const step of data.steps) {
          ns[step.node_id || step.step] = step.status;
        }
      }
      nodeStatus = ns;
      error = null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function connectStream() {
    runStream?.close();
    try {
      runStream = nullBoilerApi.streamRun(id, (event) => {
        events = [...events, { ...event, timestamp: event.timestamp ?? Date.now() / 1000 }];
        // On significant events, refresh run data
        if (['step_completed', 'step_failed', 'run_completed', 'run_failed', 'interrupted', 'state_update', 'values', 'updates', 'task_result'].includes(event.type)) {
          void loadRun();
        }
      });
    } catch {
      runStream = null;
    }
  }

  function handleBoilerChange() {
    loading = true;
    error = null;
    events = [];
    run = null;
    previousState = null;
    workflow = { nodes: {}, edges: [] };
    nodeStatus = {};
    void loadRun();
    connectStream();
  }

  onMount(() => {
    void loadRun();
    connectStream();
    stopPolling = pollWhileVisible(loadRun, 3000);
  });

  onDestroy(() => {
    stopPolling?.();
    runStream?.close();
  });

  let isInterrupted = $derived(run?.status === 'interrupted');
  let isActive = $derived(run?.status === 'running' || run?.status === 'pending');

  async function cancelRun() {
    try {
      await nullBoilerApi.cancelRun(id);
      await loadRun();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function resumeRun(updates: any) {
    try {
      await nullBoilerApi.resumeRun(id, updates);
      await loadRun();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const statusVariants: Record<string, BadgeVariant> = {
    running: 'secondary',
    pending: 'secondary',
    completed: 'success',
    failed: 'destructive',
    interrupted: 'warning',
    cancelled: 'muted',
  };

  function runForkHref(runId: string): string {
    return nullboilerUiRoutes.runFork(runId);
  }
</script>

<div class="run-detail">
  <PageHeader title={(id || '').slice(0, 8)} subtitle="Run">
    {#snippet controls()}
      {#if run}
        <Badge variant={statusVariants[run.status] || 'muted'}>{run.status}</Badge>
      {/if}
      <BoilerInstanceSelector onChange={handleBoilerChange} />
    {/snippet}
    {#snippet actions()}
      {#if isActive}
        <Button variant="destructive" size="icon-sm" onclick={cancelRun} title="Cancel run" aria-label="Cancel run">
          <CircleXIcon />
        </Button>
      {/if}
      <Button variant="outline" size="icon-sm" href={runForkHref(id)} title="Fork run" aria-label="Fork run">
        <GitForkIcon />
      </Button>
    {/snippet}
  </PageHeader>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if loading}
    <div class="loading">Loading run...</div>
  {:else if run}
    <div class="panels">
      <div class="panel-left">
        <GraphViewer {workflow} {nodeStatus} />
      </div>
      <div class="panel-right">
        <StateInspector currentState={run.state} {previousState} />
      </div>
    </div>
    <div class="panel-bottom">
      <RunEventLog {events} />
    </div>

    {#if isInterrupted}
      <InterruptPanel
        message={run.interrupt_message || ''}
        onResume={resumeRun}
        onCancel={cancelRun}
      />
    {/if}
  {/if}
</div>

<style>
  .run-detail {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: calc(100vh - 3rem);
  }
  .panels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    flex: 1;
    min-height: 0;
  }
  .panel-left,
  .panel-right {
    min-height: 0;
    overflow: auto;
  }
  .panel-bottom {
    height: 250px;
    flex-shrink: 0;
  }
  .error-banner {
    padding: 0.75rem 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    flex-shrink: 0;
  }
  .loading {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--shadcn-muted-foreground);
  }
  @media (max-width: 900px) {
    .panels {
      grid-template-columns: 1fr;
    }
  }
</style>
