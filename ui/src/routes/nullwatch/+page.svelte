<script lang="ts">
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import { api, nullWatchApi } from '$lib/api/client';
  import { pollWhileVisible } from '$lib/poll';
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
  } from '$lib/entity-view';
  import { Button } from '$lib/components/ui/button';
  import { Select } from '$lib/components/ui/select';
  import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

  let summary = $state<any>(null);
  let runs = $state<any[]>([]);
  let selectedRunId = $state('');
  let selectedRun = $state<any>(null);
  let status = $state<any>(null);
  let selectedWatchName = $state('');
  let watchSelectionInitialized = $state(false);
  let loading = $state(true);
  let loadingRun = $state(false);
  let error = $state<string | null>(null);
  let stopPolling: (() => void) | null = null;
  let overviewTimer: ReturnType<typeof setTimeout> | null = null;

  type WatchOption = {
    name: string;
    status: string;
    port: number;
  };

  let watchOptions = $derived(extractWatchOptions(status));
  let selectedWatch = $derived(
    watchOptions.find((watch) => watch.name === selectedWatchName) || null,
  );
  const selectedSummary = $derived(selectedRun?.summary || null);
  const sortedSpans = $derived(
    (selectedRun?.spans || []).slice().sort((a: any, b: any) => (a.started_at_ms || 0) - (b.started_at_ms || 0)),
  );
  const sortedEvals = $derived(
    (selectedRun?.evals || []).slice().sort((a: any, b: any) => (a.recorded_at_ms || 0) - (b.recorded_at_ms || 0)),
  );
  const requestedRunId = $derived($page.url.searchParams.get('run_id') || '');
  const runColumns: EntityColumn[] = [
    { id: 'verdict', label: 'Verdict', type: 'select', width: 'minmax(100px,.34fr)' },
    { id: 'duration', label: 'Duration', type: 'mono', width: 'minmax(110px,.36fr)' },
    { id: 'tokens', label: 'Tokens', type: 'mono', width: 'minmax(120px,.4fr)' },
    { id: 'cost', label: 'Cost', type: 'mono', width: 'minmax(100px,.32fr)' },
    { id: 'first_seen', label: 'First Seen', type: 'date', width: 'minmax(150px,.55fr)' },
  ];
  const runViews = createViewSet({
    kanban: { groupBy: 'verdict' },
    tree: { parentField: 'verdict' },
    timeline: { dateField: 'first_seen' },
    calendar: { dateField: 'first_seen' },
  });
  const runRecords = $derived(
    runs.map((run) => {
      const tokenCount = (run.total_input_tokens || 0) + (run.total_output_tokens || 0);
      return {
        id: `nullwatch-run:${run.run_id}`,
        title: run.run_id,
        type: 'run',
        status: run.overall_verdict === 'pass' ? 'success' : run.overall_verdict === 'fail' ? 'failed' : 'pending',
        subtitle: `${formatDuration(run.total_duration_ms)} · ${formatTokens(run.total_input_tokens, run.total_output_tokens)} tokens`,
        description: `${formatCost(run.total_cost_usd)} · ${formatTime(run.first_seen_ms)}`,
        date: run.first_seen_ms ? new Date(run.first_seen_ms).toISOString() : '',
        fields: {
          run_id: run.run_id,
          verdict: run.overall_verdict || 'unknown',
          duration: formatDuration(run.total_duration_ms),
          tokens: tokenCount > 0 ? tokenCount.toLocaleString() : '-',
          cost: formatCost(run.total_cost_usd),
          first_seen: run.first_seen_ms ? new Date(run.first_seen_ms).toISOString() : '',
        },
        raw: run,
      };
    }) satisfies EntityRecord[],
  );

  function extractWatchOptions(value: any): WatchOption[] {
    const instances = value?.instances?.nullwatch || {};
    return Object.entries(instances)
      .map(([name, info]: [string, any]) => ({
        name,
        status: info?.status || 'stopped',
        port: info?.port || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function preferredWatch(options: WatchOption[], requested: string): string {
    if (requested && options.some((watch) => watch.name === requested)) return requested;
    const running = options.find((watch) => watch.status === 'running');
    if (running) return running.name;
    const starting = options.find((watch) => watch.status === 'starting' || watch.status === 'restarting');
    if (starting) return starting.name;
    return options[0]?.name || '';
  }

  function urlWatchName(): string {
    try {
      return new URLSearchParams(window.location.search).get('watch') || '';
    } catch {
      return '';
    }
  }

  function setUrlWatchName(name: string) {
    try {
      const url = new URL(window.location.href);
      if (name) {
        url.searchParams.set('watch', name);
      } else {
        url.searchParams.delete('watch');
      }
      window.history.replaceState(null, '', url);
    } catch {
      /* ignore */
    }
  }

  async function refreshWatchSelection(): Promise<string | undefined> {
    try {
      const statusResult = await api.getStatus();
      status = statusResult;
      const options = extractWatchOptions(statusResult);
      const requested = watchSelectionInitialized ? selectedWatchName : urlWatchName();
      selectedWatchName = preferredWatch(options, requested);
      watchSelectionInitialized = true;
    } catch {
      watchSelectionInitialized = true;
    }
    return selectedWatchName || undefined;
  }

  async function loadOverview() {
    try {
      const watch = await refreshWatchSelection();
      const [summaryResult, runsResult] = await Promise.all([
        nullWatchApi.getNullWatchSummary({ watch }),
        nullWatchApi.getNullWatchRuns({ limit: 50, watch }),
      ]);
      summary = summaryResult;
      runs = runsResult?.items || [];
      error = null;

      if (selectedRunId && selectedRunId !== requestedRunId && !runs.some((run) => run.run_id === selectedRunId)) {
        selectedRunId = '';
        selectedRun = null;
      }

      if (!selectedRunId && requestedRunId) {
        await selectRun(requestedRunId);
      } else if (!selectedRunId && runs.length > 0) {
        await selectRun(runs[0].run_id);
      } else if (selectedRunId) {
        await loadRun(selectedRunId, false);
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function loadRun(runId: string, showSpinner = true) {
    if (showSpinner) loadingRun = true;
    try {
      selectedRun = await nullWatchApi.getNullWatchRun(runId, { watch: selectedWatchName || undefined });
      error = null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loadingRun = false;
    }
  }

  async function selectRun(runId: string) {
    selectedRunId = runId;
    await loadRun(runId);
  }

  async function handleWatchChange(event: Event) {
    selectedWatchName = (event.currentTarget as HTMLSelectElement).value;
    setUrlWatchName(selectedWatchName);
    selectedRunId = '';
    selectedRun = null;
    loading = true;
    await loadOverview();
  }

  onMount(() => {
    overviewTimer = setTimeout(() => void loadOverview(), 350);
    stopPolling = pollWhileVisible(loadOverview, 5000);
  });

  onDestroy(() => {
    if (overviewTimer) clearTimeout(overviewTimer);
    stopPolling?.();
  });

  function formatDuration(ms: number | undefined | null): string {
    if (ms == null) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  }

  function formatCost(cost: number | undefined | null): string {
    if (cost == null || cost === 0) return '$0.0000';
    return `$${cost.toFixed(4)}`;
  }

  function formatTime(ms: number | undefined | null): string {
    if (!ms) return '-';
    return new Date(ms).toLocaleString();
  }

  function formatTokens(input: number | undefined | null, output: number | undefined | null): string {
    const total = (input || 0) + (output || 0);
    return total > 0 ? total.toLocaleString() : '-';
  }

  function verdictVariant(verdict: string | undefined): BadgeVariant {
    if (verdict === 'pass') return 'success';
    if (verdict === 'fail') return 'destructive';
    return 'muted';
  }

  function statusVariant(status: string | undefined): BadgeVariant {
    if (status === 'ok') return 'success';
    if (status === 'error') return 'destructive';
    return 'muted';
  }

  function statusClass(status: string | undefined): string {
    if (status === 'ok') return 'pass';
    if (status === 'error') return 'fail';
    return 'neutral';
  }
</script>

<div class="flight-recorder">
  {#if error}
    <div class="banner banner-error">{error}</div>
  {/if}

  <div class="metric-grid">
    <div class="metric">
      <span class="label">Runs</span>
      <strong>{summary?.run_count ?? 0}</strong>
    </div>
    <div class="metric">
      <span class="label">Spans</span>
      <strong>{summary?.span_count ?? 0}</strong>
    </div>
    <div class="metric">
      <span class="label">Errors</span>
      <strong class:bad={(summary?.error_count || 0) > 0}>{summary?.error_count ?? 0}</strong>
    </div>
    <div class="metric">
      <span class="label">Eval Pass</span>
      <strong>{summary?.pass_count ?? 0}</strong>
    </div>
    <div class="metric">
      <span class="label">Eval Fail</span>
      <strong class:bad={(summary?.fail_count || 0) > 0}>{summary?.fail_count ?? 0}</strong>
    </div>
    <div class="metric">
      <span class="label">Cost</span>
      <strong>{formatCost(summary?.total_cost_usd)}</strong>
    </div>
  </div>

  {#if loading && runs.length === 0}
    <div class="loading">Loading NullWatch data...</div>
  {:else}
    <div class="workspace">
      <section class="runs-panel">
        <UniversalEntityView
          title="Runs"
          description={selectedWatch ? `${selectedWatch.name} / ${runs.length}` : `${runs.length} runs`}
          records={runRecords}
          columns={runColumns}
          views={runViews}
          defaultViewId="list"
          loading={loading && runs.length === 0}
          emptyTitle="No NullWatch runs"
          emptyDescription="No flight recorder runs found for the selected instance."
          onSelect={(record) => selectRun(String(record.fields?.run_id || record.title))}
          onOpen={(record) => selectRun(String(record.fields?.run_id || record.title))}
        >
          {#snippet headerControls()}
            {#if watchOptions.length > 1}
              <Select
                value={selectedWatchName}
                onchange={handleWatchChange}
                class="watch-select"
                aria-label="NullWatch instance"
              >
                {#each watchOptions as watch}
                  <option value={watch.name}>
                    {watch.name} · {watch.status}{watch.port ? ` :${watch.port}` : ''}
                  </option>
                {/each}
              </Select>
            {:else if watchOptions.length === 1}
              <Badge variant="muted">{watchOptions[0].name} · {watchOptions[0].status}</Badge>
            {/if}
          {/snippet}
          {#snippet headerActions()}
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={loadOverview}
              disabled={loading}
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCwIcon size={15} />
            </Button>
          {/snippet}
        </UniversalEntityView>
      </section>

      <section class="detail-panel">
        {#if loadingRun}
          <div class="loading">Loading run detail...</div>
        {:else if selectedRun}
          <div class="detail-header">
            <div>
              <h2>{selectedSummary?.run_id}</h2>
              <div class="detail-meta">
                <span>{formatTime(selectedSummary?.first_seen_ms)}</span>
                <span>{formatDuration(selectedSummary?.total_duration_ms)}</span>
                <span>{formatCost(selectedSummary?.total_cost_usd)}</span>
              </div>
            </div>
            <Badge variant={verdictVariant(selectedSummary?.overall_verdict)}>{selectedSummary?.overall_verdict}</Badge>
          </div>

          <div class="detail-stats">
            <div><span>Spans</span><strong>{selectedSummary?.span_count || 0}</strong></div>
            <div><span>Errors</span><strong>{selectedSummary?.error_count || 0}</strong></div>
            <div><span>Evals</span><strong>{selectedSummary?.eval_count || 0}</strong></div>
            <div><span>Tokens</span><strong>{formatTokens(selectedSummary?.total_input_tokens, selectedSummary?.total_output_tokens)}</strong></div>
          </div>

          <div class="section-title">Span Timeline</div>
          <div class="timeline">
            {#each sortedSpans as span}
              <div class="span-row">
                <div class="span-marker {statusClass(span.status)}"></div>
                <div class="span-body">
                  <div class="span-top">
                    <span class="mono">{span.operation}</span>
                    <Badge variant={statusVariant(span.status)}>{span.status}</Badge>
                  </div>
                  <div class="span-meta">
                    <span>{span.source}</span>
                    {#if span.agent_id}<span>{span.agent_id}</span>{/if}
                    {#if span.tool_name}<span>{span.tool_name}</span>{/if}
                    {#if span.model}<span>{span.model}</span>{/if}
                    <span>{formatDuration(span.duration_ms)}</span>
                  </div>
                  {#if span.error_message}
                    <div class="span-error">{span.error_message}</div>
                  {/if}
                  {#if span.attributes_json}
                    <pre>{span.attributes_json}</pre>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <div class="section-title">Evals</div>
          {#if sortedEvals.length === 0}
            <div class="empty-state">No evals attached to this run.</div>
          {:else}
            <div class="eval-list">
              {#each sortedEvals as evaluation}
                <div class="eval-row">
                  <div>
                    <span class="mono">{evaluation.eval_key}</span>
                    <span class="muted">{evaluation.scorer} · {evaluation.dataset || '-'}</span>
                  </div>
                  <div class="eval-score">
                    <span>{evaluation.score.toFixed(2)}</span>
                    <Badge variant={verdictVariant(evaluation.verdict)}>{evaluation.verdict}</Badge>
                  </div>
                  {#if evaluation.notes}
                    <p>{evaluation.notes}</p>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <div class="empty-state">Select a run.</div>
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .flight-recorder {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 1600px;
    margin: 0 auto;
  }

  .detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--shadcn-foreground);
  }

  .muted,
  .detail-meta,
  .span-meta {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }

  .watch-select {
    width: auto;
    min-width: 12rem;
    max-width: 22rem;
  }

  .banner {
    padding: 0.75rem 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
    font-size: 0.875rem;
    color: var(--shadcn-foreground);
  }

  .banner-error {
    border-color: var(--shadcn-destructive);
    color: var(--shadcn-destructive);
    background: color-mix(in srgb, var(--shadcn-destructive) 8%, transparent);
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .metric {
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .label {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .metric strong {
    color: var(--shadcn-foreground);
    font-size: 1.35rem;
    font-weight: 600;
  }

  .metric strong.bad {
    color: var(--shadcn-destructive);
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(560px, 0.95fr) minmax(0, 1.05fr);
    gap: 1rem;
    align-items: start;
  }

  .runs-panel,
  .detail-panel {
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
    min-width: 0;
  }

  .runs-panel {
    overflow: hidden;
  }

  .detail-panel {
    padding: 1rem;
  }

  .mono {
    font-family: var(--prin7r-font-mono-standard);
    overflow-wrap: anywhere;
  }

  .detail-meta,
  .span-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.3rem;
  }

  .detail-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.5rem;
    margin: 1rem 0;
  }

  .detail-stats div {
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0.65rem;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .detail-stats span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  .detail-stats strong {
    color: var(--shadcn-foreground);
    font-weight: 600;
  }

  .section-title {
    margin: 1rem 0 0.6rem;
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .span-row {
    display: grid;
    grid-template-columns: 12px minmax(0, 1fr);
    gap: 0.75rem;
  }

  .span-marker {
    margin-top: 0.45rem;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--shadcn-muted-foreground);
  }

  .span-marker.pass {
    border-color: #16a34a;
    background: #16a34a;
  }

  .span-marker.fail {
    border-color: var(--shadcn-destructive);
    background: var(--shadcn-destructive);
  }

  .span-body,
  .eval-row {
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0.75rem;
    background: var(--shadcn-background);
    min-width: 0;
  }

  .span-top,
  .eval-row {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .span-error {
    margin-top: 0.55rem;
    color: var(--shadcn-destructive);
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.8125rem;
  }

  pre {
    margin: 0.55rem 0 0;
    padding: 0.6rem;
    overflow-x: auto;
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  .eval-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .eval-row {
    flex-direction: column;
  }

  .eval-score {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .eval-row p {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }

  .loading,
  .empty-state {
    padding: 1rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }

  @media (max-width: 1100px) {
    .metric-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .workspace {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 680px) {
    .metric-grid,
    .detail-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .detail-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .watch-select {
      width: 100%;
      min-width: 0;
    }
  }
</style>
