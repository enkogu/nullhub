<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { api } from '$lib/api/client';
  import type {
    MissionControlEvent,
    MissionControlPhase,
    MissionControlReplayArtifact,
    MissionControlReplayRecord,
    MissionControlState,
    MissionControlTraceRef,
    MissionControlWorkflowEvidenceCheckpoint,
    MissionControlWorkflowEvidenceRun,
  } from '$lib/api/missionControl';
  import {
    findRunningNullWatch,
    hydrateMissionTracePanels,
    isAvailableTrace,
    missionTracePanelRunIds,
    type TraceHydration,
    type TraceHydrationUnavailableReason,
  } from '$lib/missionControl/traceHydration';
  import {
    emptyControls,
    emptyTelemetry,
    errorCount,
    formatBytes,
    formatCost,
    formatDuration,
    formatTokens,
    evalCount,
    hydratedTelemetry,
    phaseOrder,
    primaryErrorText,
    primaryEvalText,
    spanCount,
    statusClass,
    phaseMilestones,
    tracePanelNote as missionTracePanelNote,
    traceSuffix,
    traceSourceLabel as missionTraceSourceLabel,
    traceSourceSummary as missionTraceSourceSummary,
    traceVerdict,
  } from '$lib/missionControl/display';
  import ReplayComparisonPanel from '$lib/missionControl/ReplayComparisonPanel.svelte';
  import {
    REPLAY_AUTOMATION_PREROLL_MS,
    nextReplayAutomationTransition,
  } from '$lib/missionControl/replayAutomation.js';
  import { nullboilerUiRoutes } from '$lib/nullboiler/routes';
  import { PageHeader } from '$lib/components/ui/page-header';
  import { Card } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
  import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
  import PlayIcon from '@lucide/svelte/icons/play';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

  type MissionAction = 'launch' | 'reset' | 'recover';
  type ReplayAutomationStage = 'idle' | 'resetting' | 'preroll' | 'launching' | 'waiting_failure' | 'holding_failure' | 'recovering' | 'watching';

  let mission = $state<MissionControlState | null>(null);
  let loading = $state(true);
  let acting = $state<MissionAction | null>(null);
  let exporting = $state(false);
  let replayAutomationActive = $state(false);
  let replayAutomationStage = $state<ReplayAutomationStage>('idle');
  let replayAutomationStartedAt = 0;
  let replayAutomationRecoverAfterMs = 0;
  let advancingReplayAutomation = false;
  let savedReplays = $state<MissionControlReplayRecord[]>([]);
  let savedReplaysLoading = $state(false);
  let savedReplaysError = $state<string | null>(null);
  let error = $state<string | null>(null);
  let traceHydration = $state<Record<string, TraceHydration>>({});
  let traceHydrating = $state(false);
  let traceWatchName = $state<string | null>(null);
  let traceWatchUnavailableReason = $state<TraceHydrationUnavailableReason | null>(null);
  let traceHydrationKey = '';
  let traceHydrationInFlightKey = '';
  let traceHydrationCheckedAt = 0;
  let traceWatchCheckedAt = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const traceHydrationRefreshMs = 5000;
  const nodes = $derived(mission?.graph?.nodes || []);
  const edges = $derived(mission?.graph?.edges || []);
  const agents = $derived(mission?.agents || []);
  const events = $derived(mission?.events || []);
  const telemetry = $derived(mission?.telemetry || emptyTelemetry);
  const controls = $derived(mission?.controls || emptyControls);
  const modeLabel = $derived((mission?.mode || 'deterministic_local_replay').replaceAll('_', ' '));
  const activePoll = $derived(replayAutomationActive || mission?.status === 'running' || mission?.status === 'intervention_required');
  const failedRunId = $derived(mission?.failure?.run_id || mission?.failed_run_id || '');
  const recoveredRunId = $derived(mission?.recovery?.run_id || mission?.recovered_run_id || '');
  const failedTrace = $derived(failedRunId ? traceHydration[failedRunId] || null : null);
  const recoveredTrace = $derived(recoveredRunId ? traceHydration[recoveredRunId] || null : null);
  const failedTraceAvailable = $derived(isAvailableTrace(failedTrace));
  const recoveredTraceAvailable = $derived(isAvailableTrace(recoveredTrace));
  const liveTraceAvailable = $derived(failedTraceAvailable || recoveredTraceAvailable);
  const workflowEvidence = $derived(mission?.workflow_evidence || null);
  const failedWorkflowRun = $derived(workflowEvidence?.failed_run || null);
  const recoveredWorkflowRun = $derived(workflowEvidence?.recovered_run || null);
  const workflowCheckpoint = $derived(workflowEvidence?.checkpoint || null);
  const replayComparison = $derived(mission?.replay_comparison || null);
  const liveWorkflowAvailable = $derived(
    workflowEvidence?.status === 'available' && Boolean(failedWorkflowRun || recoveredWorkflowRun || workflowCheckpoint),
  );
  const displayTelemetry = $derived(hydratedTelemetry(telemetry, [failedTrace, recoveredTrace]));
  const pageBusy = $derived(loading || acting !== null || exporting || replayAutomationActive);
  const canSaveReplay = $derived(Boolean(mission?.status === 'completed' && mission?.replay_comparison));

  const statusBadgeVariants: Record<string, BadgeVariant> = {
    done: 'success',
    active: 'secondary',
    error: 'destructive',
    warning: 'warning',
    pending: 'muted',
  };

  function statusVariant(value: string | undefined): BadgeVariant {
    return statusBadgeVariants[statusClass(value)] || 'muted';
  }

  function verdictVariant(value: string | undefined): BadgeVariant {
    if (!value || value === '-') return 'muted';
    if (value === 'pass') return 'success';
    if (value === 'fail') return 'destructive';
    return 'secondary';
  }

  function schedulePoll() {
    if (disposed) return;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => void loadMission(), activePoll ? 1000 : 5000);
  }

  async function loadMission() {
    try {
      const nextMission = await api.getMissionControlState();
      applyMissionState(nextMission);
      error = null;
      await advanceReplayAutomation(nextMission);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
      schedulePoll();
    }
  }

  async function runAction(name: MissionAction) {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    replayAutomationActive = false;
    replayAutomationStage = 'idle';
    acting = name;
    try {
      let nextMission: MissionControlState | null = null;
      if (name === 'launch') nextMission = await api.launchMissionControl();
      if (name === 'reset') nextMission = await api.resetMissionControl();
      if (name === 'recover') nextMission = await api.recoverMissionControl();
      if (nextMission) {
        applyMissionState(nextMission);
      }
      error = null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      acting = null;
      schedulePoll();
    }
  }

  async function runReplayAutomation() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    replayAutomationActive = true;
    replayAutomationStage = 'resetting';
    replayAutomationStartedAt = Date.now();
    replayAutomationRecoverAfterMs = 0;
    try {
      applyMissionState(await api.resetMissionControl());
      error = null;
      if (disposed) return;

      replayAutomationStage = 'preroll';
      await sleep(REPLAY_AUTOMATION_PREROLL_MS);
      if (disposed) return;

      replayAutomationStage = 'launching';
      applyMissionState(await api.launchMissionControl());
      replayAutomationStage = 'waiting_failure';
      error = null;
    } catch (e) {
      replayAutomationActive = false;
      replayAutomationStage = 'idle';
      error = (e as Error).message;
    } finally {
      schedulePoll();
    }
  }

  async function advanceReplayAutomation(snapshot: MissionControlState) {
    if (!replayAutomationActive || advancingReplayAutomation) return;

    const now = Date.now();
    const transition = nextReplayAutomationTransition(
      snapshot,
      {
        active: replayAutomationActive,
        stage: replayAutomationStage,
        startedAtMs: replayAutomationStartedAt,
        recoverAfterMs: replayAutomationRecoverAfterMs,
      },
      now,
    );
    replayAutomationActive = transition.active;
    replayAutomationStage = transition.stage;
    replayAutomationRecoverAfterMs = transition.recoverAfterMs;
    if (transition.error) error = transition.error;
    if (transition.action !== 'recover') return;

    advancingReplayAutomation = true;
    replayAutomationStage = 'recovering';
    try {
      const recoveredMission = await api.recoverMissionControl();
      applyMissionState(recoveredMission);
      if (recoveredMission.status === 'completed') {
        replayAutomationActive = false;
        replayAutomationStage = 'idle';
      } else {
        replayAutomationStage = 'watching';
      }
      error = null;
    } catch (e) {
      replayAutomationActive = false;
      replayAutomationStage = 'idle';
      error = (e as Error).message;
    } finally {
      advancingReplayAutomation = false;
    }
  }

  async function exportReplay() {
    exporting = true;
    try {
      const saved = await api.saveMissionControlReplay();
      savedReplays = [saved.record, ...savedReplays.filter((item) => item.id !== saved.record.id)].slice(0, 10);
      savedReplaysError = null;
      downloadReplayArtifact(saved.artifact, replayFileName(saved.artifact));
      error = null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      exporting = false;
    }
  }

  async function loadSavedReplays() {
    savedReplaysLoading = true;
    try {
      const result = await api.listMissionControlReplays();
      savedReplays = result.items || [];
      savedReplaysError = null;
    } catch (e) {
      savedReplaysError = (e as Error).message;
    } finally {
      savedReplaysLoading = false;
    }
  }

  async function downloadStoredReplay(record: MissionControlReplayRecord) {
    try {
      const artifact = await api.getStoredMissionControlReplay(record.id);
      downloadReplayArtifact(artifact, storedReplayFileName(record));
      error = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function downloadReplayArtifact(artifact: MissionControlReplayArtifact, filename: string) {
    const json = JSON.stringify(artifact, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function applyMissionState(nextMission: MissionControlState) {
    mission = nextMission;
    queueTraceHydration(nextMission);
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  onMount(() => {
    void loadMission();
    void loadSavedReplays();
  });

  onDestroy(() => {
    disposed = true;
    if (pollTimer) clearTimeout(pollTimer);
  });

  function queueTraceHydration(snapshot: MissionControlState) {
    void refreshTraceHydration(snapshot);
  }

  async function refreshTraceHydration(snapshot: MissionControlState) {
    const runIds = missionTracePanelRunIds(snapshot);
    if (runIds.length === 0) {
      traceHydration = {};
      traceHydrationKey = '';
      traceHydrationInFlightKey = '';
      traceHydrationCheckedAt = Date.now();
      traceHydrating = false;
      return;
    }

    const watch = await runningNullWatchName();
    if (disposed) return;

    const key = `${watch || 'none'}:${runIds.join('|')}`;
    const now = Date.now();
    if (traceHydrationInFlightKey === key) return;
    if (traceHydrationKey === key && now - traceHydrationCheckedAt < traceHydrationRefreshMs) return;

    traceHydrationInFlightKey = key;
    traceHydrating = Boolean(watch);
    try {
      const traces = await hydrateMissionTracePanels(
        api,
        snapshot,
        watch,
        traceWatchUnavailableReason || 'no_running_nullwatch',
      );
      if (disposed || traceHydrationInFlightKey !== key) return;

      traceHydration = traces;
      traceHydrationKey = key;
      traceHydrationCheckedAt = Date.now();
    } finally {
      if (traceHydrationInFlightKey === key) {
        traceHydrationInFlightKey = '';
        traceHydrating = false;
      }
    }
  }

  async function runningNullWatchName(): Promise<string | null> {
    const now = Date.now();
    if (now - traceWatchCheckedAt < 5000) return traceWatchName;
    traceWatchCheckedAt = now;

    const selection = await findRunningNullWatch(api);
    traceWatchName = selection.watch;
    traceWatchUnavailableReason = selection.watch ? null : selection.unavailableReason || 'no_running_nullwatch';
    return traceWatchName;
  }

  function phaseRank(phase: MissionControlPhase | undefined | null): number {
    if (!phase) return -1;
    return phaseOrder.indexOf(phase);
  }

  function phaseReached(phase: MissionControlPhase): boolean {
    if (!mission) return false;
    return phaseRank(mission.phase) >= phaseRank(phase);
  }

  function storyClass(phase: MissionControlPhase, tone: 'error' | 'success' | undefined): string {
    if (!mission || !phaseReached(phase)) return 'pending';
    if (mission.phase === phase && tone === 'error') return 'error';
    if (mission.phase === phase) return 'active';
    if (tone === 'error' && !mission.recovery) return 'error';
    if (tone === 'success' && mission.status === 'completed') return 'done';
    return 'done';
  }

  function storyVariant(phase: MissionControlPhase, tone: 'error' | 'success' | undefined): BadgeVariant {
    return statusBadgeVariants[storyClass(phase, tone)] || 'muted';
  }

  function nullwatchHref(runId: string | null | undefined): string {
    const params = new URLSearchParams();
    if (runId) params.set('run_id', runId);
    if (traceWatchName) params.set('watch', traceWatchName);
    const query = params.toString();
    return query ? `/nullwatch?${query}` : '/nullwatch';
  }

  function traceLabel(trace: MissionControlTraceRef): string {
    return trace.eval_key || trace.span_id || trace.operation;
  }

  function replayFileName(artifact: MissionControlReplayArtifact): string {
    const scenario = (artifact.scenario_id || mission?.scenario_id || 'mission').replace(/[^a-z0-9._-]+/gi, '-');
    const phase = (artifact.snapshot?.phase || mission?.phase || 'snapshot').replace(/[^a-z0-9._-]+/gi, '-');
    return `nullhub-${scenario}-${phase}-replay.json`;
  }

  function replayAutomationButtonLabel(): string {
    if (!replayAutomationActive) return 'Replay Mission';
    if (replayAutomationStage === 'resetting') return 'Resetting...';
    if (replayAutomationStage === 'preroll') return 'Preparing...';
    if (replayAutomationStage === 'launching') return 'Launching...';
    if (replayAutomationStage === 'waiting_failure') return 'Waiting Failure...';
    if (replayAutomationStage === 'holding_failure') return 'Holding Failure...';
    if (replayAutomationStage === 'recovering') return 'Forking...';
    return 'Watching...';
  }

  function storedReplayFileName(record: MissionControlReplayRecord): string {
    const scenario = (record.scenario_id || 'mission').replace(/[^a-z0-9._-]+/gi, '-');
    const phase = (record.phase || 'snapshot').replace(/[^a-z0-9._-]+/gi, '-');
    return `nullhub-${scenario}-${phase}-${record.saved_at_ms}.json`;
  }

  function replaySavedAt(record: MissionControlReplayRecord): string {
    if (!record.saved_at_ms) return '-';
    return new Date(record.saved_at_ms).toLocaleString();
  }

  function traceSourceLabel(trace: TraceHydration | null): string {
    return missionTraceSourceLabel(trace, traceHydrating);
  }

  function traceSourceSummary(): string {
    return missionTraceSourceSummary({
      liveTraceAvailable,
      traceHydrating,
      hasRunIds: Boolean(failedRunId || recoveredRunId),
    });
  }

  function tracePanelNote(): string {
    return missionTracePanelNote({
      liveTraceAvailable,
      traceHydrating,
      hasRunIds: Boolean(failedRunId || recoveredRunId),
      hasWatch: Boolean(traceWatchName),
      unavailableMessage: failedTrace?.message || recoveredTrace?.message || null,
    });
  }

  function workflowRunHref(runId: string): string {
    return nullboilerUiRoutes.run(runId, { boilerInstance: workflowEvidence?.boiler_instance || undefined });
  }

  function workflowSourceSummary(): string {
    if (liveWorkflowAvailable) return 'Live NullBoiler';
    if (workflowEvidence?.status === 'not_configured') return 'NullBoiler not configured';
    if (workflowEvidence?.status === 'ambiguous') return 'Ambiguous NullBoiler evidence';
    if (workflowEvidence?.status === 'not_found') return 'No matching NullBoiler evidence';
    if (workflowEvidence?.status === 'schema_mismatch') return 'NullBoiler schema mismatch';
    return 'NullBoiler unavailable';
  }

  function workflowPanelNote(): string {
    if (liveWorkflowAvailable) return 'Hydrated workflow evidence';
    if (workflowEvidence?.reason) return workflowEvidence.reason.replaceAll('_', ' ');
    if (mission?.failure || mission?.recovery) return 'No matching workflow evidence';
    return 'Waiting for checkpoint';
  }

  function workflowRunSuffix(run: MissionControlWorkflowEvidenceRun | null): string {
    if (!run) return '';
    const parts = [run.status];
    if (run.checkpoint_count != null) parts.push(`${run.checkpoint_count} checkpoints`);
    return ` · ${parts.join(' · ')}`;
  }

  function workflowCheckpointLabel(checkpoint: MissionControlWorkflowEvidenceCheckpoint | null): string {
    if (!checkpoint) return '';
    const parts = [checkpoint.step_id || 'checkpoint'];
    if (checkpoint.version != null) parts.push(`v${checkpoint.version}`);
    return parts.join(' · ');
  }

  function workflowCheckpointMetadata(checkpoint: MissionControlWorkflowEvidenceCheckpoint | null): string {
    if (!checkpoint?.metadata || typeof checkpoint.metadata !== 'object' || Array.isArray(checkpoint.metadata)) return '';
    const metadata = checkpoint.metadata as Record<string, unknown>;
    const keys = Object.keys(metadata).filter((key) => key !== 'route_results');
    if (keys.length === 0) return '';
    return `metadata: ${keys.slice(0, 4).join(', ')}`;
  }

  function runVerdict(kind: 'failed' | 'recovered'): string {
    const liveVerdict = traceVerdict(kind === 'failed' ? failedTrace : recoveredTrace);
    if (liveVerdict && liveVerdict !== 'live') return liveVerdict;
    if (kind === 'failed') return mission?.failure ? 'fail' : 'pending';
    if (!mission?.recovery) return 'pending';
    return mission.status === 'completed' ? 'pass' : 'recovering';
  }
</script>

<div class="mission-page" aria-busy={pageBusy}>
  <PageHeader title="Mission Control" subtitle={mission?.headline || 'Loading mission state...'}>
    {#snippet actions()}
      <Button
        variant="outline"
        onclick={() => runAction('reset')}
        disabled={acting !== null || loading || replayAutomationActive}
      >
        Reset
      </Button>
      <Button
        onclick={() => runReplayAutomation()}
        disabled={loading || acting !== null || exporting || replayAutomationActive}
      >
        {replayAutomationButtonLabel()}
      </Button>
      <Button
        variant="outline"
        size="icon"
        onclick={() => runAction('launch')}
        disabled={!controls.can_launch || acting !== null || loading || replayAutomationActive}
        title={acting === 'launch' ? 'Launching...' : 'Launch Mission'}
        aria-label="Launch Mission"
      >
        <PlayIcon />
      </Button>
      <Button
        variant="destructive"
        onclick={() => runAction('recover')}
        disabled={!controls.can_recover || acting !== null || loading || replayAutomationActive}
      >
        {acting === 'recover' ? 'Forking...' : 'Fork From Checkpoint'}
      </Button>
      <Button
        variant="outline"
        onclick={() => exportReplay()}
        disabled={!canSaveReplay || exporting || loading || replayAutomationActive}
      >
        {exporting ? 'Saving...' : 'Save Replay'}
      </Button>
    {/snippet}
  </PageHeader>

  {#if error}
    <div class="error-banner" role="alert">
      <span>{error}</span>
      <Button variant="outline" size="sm" onclick={() => loadMission()} disabled={acting !== null}>
        <RefreshCwIcon />
        Retry
      </Button>
    </div>
  {/if}

  {#if loading && !mission}
    <div class="loading">Loading mission...</div>
  {:else if mission}
    <div class="strip" aria-label="Mission replay metadata">
      <Card class="px-5">
        <div class="stat"><span>Mode</span><strong>{modeLabel}</strong></div>
      </Card>
      <Card class="px-5">
        <div class="stat"><span>Scenario</span><strong>{mission.scenario_id}</strong></div>
      </Card>
      <Card class="px-5">
        <div class="stat"><span>Schema</span><strong>v{mission.schema_version}</strong></div>
      </Card>
      <Card class="px-5">
        <div class="stat"><span>Polling</span><strong>{activePoll ? 'live' : 'idle'}</strong></div>
      </Card>
    </div>

    <div class="strip">
      <Card class="px-5">
        <div class="stat">
          <span>Status</span>
          <Badge variant={statusVariant(mission.status)}>{mission.status}</Badge>
        </div>
      </Card>
      <Card class="px-5">
        <div class="stat"><span>Phase</span><strong>{mission.phase}</strong></div>
      </Card>
      <Card class="px-5">
        <div class="stat"><span>Elapsed</span><strong>{formatDuration(mission.elapsed_ms)}</strong></div>
      </Card>
      <Card class="px-5">
        <div class="stat"><span>Run</span><strong>{mission.active_run_id || '-'}</strong></div>
      </Card>
    </div>

    {#if savedReplays.length > 0 || savedReplaysLoading || savedReplaysError}
      <Card class="px-5">
        <div class="section-head">
          <h2>Saved Replays</h2>
        </div>
        {#if savedReplaysError}
          <p class="saved-replay-error">{savedReplaysError}</p>
        {/if}
        {#if savedReplays.length > 0}
          <div class="saved-replay-list">
            {#each savedReplays.slice(0, 4) as replay}
              <Button variant="outline" class="saved-replay-row" onclick={() => downloadStoredReplay(replay)}>
                <span>{replaySavedAt(replay)}</span>
                <strong>{replay.phase} · {replay.status}</strong>
                <small>{replay.scenario_id} · {formatBytes(replay.size_bytes)}</small>
              </Button>
            {/each}
          </div>
        {/if}
      </Card>
    {/if}

    <div class="strip story-strip" aria-label="Mission phase milestones">
      {#each phaseMilestones as beat}
        <Card class="px-5">
          <div class="story-beat">
            <span>{beat.time}</span>
            <strong>{beat.title}</strong>
            <p>{beat.detail}</p>
            <Badge variant={storyVariant(beat.phase, beat.tone)}>{storyClass(beat.phase, beat.tone)}</Badge>
          </div>
        </Card>
      {/each}
    </div>

    <div class="progress-track" aria-label="Mission progress">
      <div style="width: {mission.progress}%"></div>
    </div>

    <Card class="px-5">
      <div class="section-head">
        <h2>Live NullBoiler</h2>
        <span class="section-meta">{mission.progress}%</span>
      </div>
      <div class="graph-row">
        {#each nodes as node, index}
          <div class="node-wrap">
            <div class="node {statusClass(node.status)}">
              <span>{node.kind}</span>
              <strong>{node.label}</strong>
            </div>
            {#if index < nodes.length - 1}
              <div class="edge {statusClass(edges[index]?.status)}"></div>
            {/if}
          </div>
        {/each}
      </div>
    </Card>

    <div class="mission-grid">
      <Card class="px-5">
        <div class="section-head">
          <h2>Agent Board</h2>
        </div>
        <div class="agent-list">
          {#each agents as agent}
            <div class="agent-row {statusClass(agent.status)}">
              <div>
                <strong>{agent.role}</strong>
                <span>{agent.id}</span>
              </div>
              <p>{agent.current_step}</p>
              <Badge variant={statusVariant(agent.status)}>{agent.status}</Badge>
            </div>
          {/each}
        </div>
      </Card>

      <Card class="px-5">
        <div class="section-head">
          <h2>Telemetry</h2>
          <Badge variant={verdictVariant(displayTelemetry.verdict)}>{displayTelemetry.verdict || '-'}</Badge>
        </div>
        <div class="metric-grid">
          <div><span>Runs</span><strong>{displayTelemetry.runs || 0}</strong></div>
          <div><span>Spans</span><strong>{displayTelemetry.spans || 0}</strong></div>
          <div><span>Evals</span><strong>{displayTelemetry.evals || 0}</strong></div>
          <div><span>Errors</span><strong class:error={(displayTelemetry.errors || 0) > 0}>{displayTelemetry.errors || 0}</strong></div>
          <div><span>Tokens</span><strong>{formatTokens(displayTelemetry.total_tokens)}</strong></div>
          <div><span>Cost</span><strong>{formatCost(displayTelemetry.total_cost_usd)}</strong></div>
        </div>

        <div class="trace-card">
          <div>
            <span>Traceability</span>
            <strong>{traceSourceSummary()}</strong>
            <em>{tracePanelNote()}</em>
          </div>
          {#if failedTraceAvailable}
            <a href={nullwatchHref(failedRunId)}>Failed run{traceSuffix(failedTrace)}</a>
          {:else if failedRunId && traceHydrating}
            <span class="trace-placeholder">Checking failed run</span>
          {:else if failedTrace?.message}
            <span class="trace-placeholder">{failedTrace.message}</span>
          {:else if failedRunId}
            <span class="trace-placeholder">Failed run unavailable</span>
          {:else}
            <span class="trace-placeholder">Failed pending</span>
          {/if}
          {#if recoveredTraceAvailable}
            <a href={nullwatchHref(recoveredRunId)}>Recovered run{traceSuffix(recoveredTrace)}</a>
          {:else if recoveredRunId && traceHydrating}
            <span class="trace-placeholder">Checking recovered run</span>
          {:else if recoveredTrace?.message}
            <span class="trace-placeholder">{recoveredTrace.message}</span>
          {:else if recoveredRunId}
            <span class="trace-placeholder">Recovered run unavailable</span>
          {:else}
            <span class="trace-placeholder">Recovery pending</span>
          {/if}
        </div>

        <div class="trace-card workflow-card">
          <div>
            <span>Workflow</span>
            <strong>{workflowSourceSummary()}</strong>
            <em>{workflowPanelNote()}</em>
          </div>
            {#if failedWorkflowRun}
              <a href={workflowRunHref(failedWorkflowRun.run_id)}>Failed workflow{workflowRunSuffix(failedWorkflowRun)}</a>
            {:else if failedRunId || mission.failure}
              <span class="trace-placeholder">Failed workflow unavailable</span>
          {:else}
            <span class="trace-placeholder">Workflow pending</span>
          {/if}
            {#if recoveredWorkflowRun}
              <a href={workflowRunHref(recoveredWorkflowRun.run_id)}>Recovered workflow{workflowRunSuffix(recoveredWorkflowRun)}</a>
            {:else if recoveredRunId || mission.recovery}
              <span class="trace-placeholder">Recovered workflow unavailable</span>
          {:else}
            <span class="trace-placeholder">Recovery pending</span>
          {/if}
        </div>

        {#if mission.failure}
          <div class="failure-box">
            <span>Failure</span>
            <strong>{mission.failure.failed_step}</strong>
            <p>{mission.failure.error_message}</p>
            <code>{workflowCheckpoint?.id || mission.failure.checkpoint_id}</code>
            {#if workflowCheckpoint}
              <p class="trace-evidence">
                NullBoiler checkpoint {workflowCheckpointLabel(workflowCheckpoint)}
                {#if workflowCheckpointMetadata(workflowCheckpoint)}
                  · {workflowCheckpointMetadata(workflowCheckpoint)}
                {/if}
              </p>
                {#if failedWorkflowRun}
                  <a href={workflowRunHref(failedWorkflowRun.run_id)}>Open failed workflow</a>
              {/if}
            {/if}
            {#if failedTraceAvailable}
              <a href={nullwatchHref(mission.failure.run_id)}>Open failed trace</a>
            {/if}
            {#if failedTrace || traceHydrating}
            <div class="trace-detail {failedTraceAvailable ? 'live' : 'loading'}">
              <div class="trace-detail-top">
                <span>{traceSourceLabel(failedTrace)}</span>
                <Badge variant={verdictVariant(traceVerdict(failedTrace) || runVerdict('failed'))}>{traceVerdict(failedTrace) || runVerdict('failed')}</Badge>
              </div>
              {#if failedTraceAvailable}
                <dl class="trace-stats">
                  <div><dt>Spans</dt><dd>{spanCount(failedTrace)}</dd></div>
                  <div><dt>Evals</dt><dd>{evalCount(failedTrace)}</dd></div>
                  <div><dt>Errors</dt><dd>{errorCount(failedTrace)}</dd></div>
                </dl>
                {#if primaryErrorText(failedTrace)}
                  <p class="trace-evidence">{primaryErrorText(failedTrace)}</p>
                {/if}
                {#if primaryEvalText(failedTrace, 'tool_success')}
                  <p class="trace-evidence">{primaryEvalText(failedTrace, 'tool_success')}</p>
                {/if}
              {:else if failedTrace?.message}
                <p class="trace-evidence">{failedTrace.message}</p>
              {/if}
            </div>
            {/if}
          </div>
        {/if}

        {#if mission.recovery}
          <div class="recovery-box">
            <span>Recovery</span>
            <strong>{mission.recovery.status}</strong>
            <p>{mission.recovery.human_instruction}</p>
            <code>{mission.recovery.run_id}</code>
              {#if recoveredWorkflowRun}
                <p class="trace-evidence">NullBoiler run {recoveredWorkflowRun.run_id}{workflowRunSuffix(recoveredWorkflowRun)}</p>
                <a href={workflowRunHref(recoveredWorkflowRun.run_id)}>Open recovered workflow</a>
            {/if}
            {#if recoveredTraceAvailable}
              <a href={nullwatchHref(mission.recovery.run_id)}>Open recovered trace</a>
            {/if}
            {#if recoveredTrace || traceHydrating}
            <div class="trace-detail {recoveredTraceAvailable ? 'live' : 'loading'}">
              <div class="trace-detail-top">
                <span>{traceSourceLabel(recoveredTrace)}</span>
                <Badge variant={verdictVariant(traceVerdict(recoveredTrace) || runVerdict('recovered'))}>{traceVerdict(recoveredTrace) || runVerdict('recovered')}</Badge>
              </div>
              {#if recoveredTraceAvailable}
                <dl class="trace-stats">
                  <div><dt>Spans</dt><dd>{spanCount(recoveredTrace)}</dd></div>
                  <div><dt>Evals</dt><dd>{evalCount(recoveredTrace)}</dd></div>
                  <div><dt>Errors</dt><dd>{errorCount(recoveredTrace)}</dd></div>
                </dl>
                {#if primaryErrorText(recoveredTrace)}
                  <p class="trace-evidence">{primaryErrorText(recoveredTrace)}</p>
                {/if}
                {#if primaryEvalText(recoveredTrace, 'tool_success')}
                  <p class="trace-evidence">{primaryEvalText(recoveredTrace, 'tool_success')}</p>
                {/if}
              {:else if recoveredTrace?.message}
                <p class="trace-evidence">{recoveredTrace.message}</p>
              {/if}
            </div>
            {/if}
          </div>
        {/if}
      </Card>
    </div>

    {#if replayComparison}
      <ReplayComparisonPanel
        {replayComparison}
        {traceWatchName}
        boilerInstance={workflowEvidence?.boiler_instance || null}
      />
    {/if}

    <Card class="px-5">
      <div class="section-head">
        <h2>Mission Timeline</h2>
      </div>
      <div class="timeline">
        {#each events as event}
          <div class="event-row {statusClass(event.status)}">
            <div class="event-marker"></div>
            <div class="event-body">
              <div class="event-top">
                <strong>{event.title}</strong>
                <span>{formatDuration(event.at_ms)}</span>
              </div>
              <div class="event-meta">
                <span>{event.source}</span>
                <span>{event.level}</span>
                {#if event.trace}
                  <a href={nullwatchHref(event.trace.run_id)} title={event.trace.operation}>
                    {event.trace.kind}: {traceLabel(event.trace)}
                  </a>
                {/if}
              </div>
              <p>{event.detail}</p>
            </div>
          </div>
        {/each}
      </div>
    </Card>
  {/if}
</div>

<style>
  .mission-page {
    padding: 1.5rem;
    max-width: 1600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-head,
  .event-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .section-head h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--shadcn-foreground);
  }

  .section-meta {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }

  .error-banner,
  .loading {
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
    padding: 0.85rem 1rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }

  .error-banner {
    color: var(--shadcn-destructive);
    border-color: var(--shadcn-destructive);
    background: color-mix(in srgb, var(--shadcn-destructive) 8%, transparent);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .stat {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    align-items: flex-start;
  }

  .stat span,
  .metric-grid span,
  .story-beat span,
  .failure-box span,
  .recovery-box span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  .stat strong,
  .metric-grid strong,
  .story-beat strong {
    display: block;
    color: var(--shadcn-foreground);
    font-size: 1.05rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .error {
    color: var(--shadcn-destructive) !important;
  }

  .story-strip {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .story-beat {
    min-height: 8rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    align-items: flex-start;
  }

  .story-beat p {
    color: var(--shadcn-muted-foreground);
    font-size: 0.78rem;
    line-height: 1.35;
    margin: 0;
    flex: 1;
  }

  .progress-track {
    height: 0.5rem;
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-muted);
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-track div {
    height: 100%;
    background: var(--shadcn-foreground);
    transition: width 0.35s ease;
  }

  .saved-replay-list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  :global(.saved-replay-row) {
    height: auto;
    min-height: 5rem;
    text-align: left;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.75rem;
    overflow: hidden;
  }

  :global(.saved-replay-row) span,
  :global(.saved-replay-row) small {
    color: var(--shadcn-muted-foreground);
    font-size: 0.72rem;
    overflow-wrap: anywhere;
  }

  :global(.saved-replay-row) strong {
    color: var(--shadcn-foreground);
    font-size: 0.95rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .saved-replay-error {
    margin: 0;
    color: var(--shadcn-destructive);
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }

  .graph-row {
    display: grid;
    grid-template-columns: repeat(7, minmax(96px, 1fr));
    gap: 0.5rem;
    align-items: center;
  }

  .node-wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 24px;
    align-items: center;
    min-width: 0;
  }

  .node-wrap:last-child {
    grid-template-columns: minmax(0, 1fr);
  }

  .node {
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
    min-height: 5.2rem;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.35rem;
  }

  .node.active {
    border-color: var(--shadcn-foreground);
  }

  .node.error {
    border-color: var(--shadcn-destructive);
  }

  .node.done {
    border-color: color-mix(in srgb, var(--shadcn-foreground) 45%, transparent);
  }

  .node span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.7rem;
  }

  .node strong {
    color: var(--shadcn-foreground);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .edge {
    height: 2px;
    background: var(--shadcn-border);
  }

  .edge.done,
  .edge.active {
    background: var(--shadcn-foreground);
  }

  .edge.error {
    background: var(--shadcn-destructive);
  }

  .mission-grid {
    display: grid;
    grid-template-columns: minmax(320px, 0.9fr) minmax(420px, 1.1fr);
    gap: 1rem;
    align-items: start;
  }

  .agent-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .agent-row {
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
    padding: 0.75rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
    gap: 0.75rem;
    align-items: center;
  }

  .agent-row.active {
    border-color: var(--shadcn-foreground);
  }

  .agent-row.error {
    border-color: var(--shadcn-destructive);
  }

  .agent-row span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }

  .agent-row strong,
  .agent-row p {
    color: var(--shadcn-foreground);
    overflow-wrap: anywhere;
    margin: 0;
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .metric-grid div {
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-muted);
    border-radius: var(--shadcn-radius);
    padding: 0.75rem;
    min-width: 0;
  }

  .metric-grid span {
    display: block;
    margin-bottom: 0.35rem;
  }

  .failure-box,
  .recovery-box,
  .trace-card {
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
    padding: 0.85rem;
  }

  .failure-box span,
  .recovery-box span {
    display: block;
    margin-bottom: 0.35rem;
  }

  .failure-box {
    border-color: var(--shadcn-destructive);
  }

  .recovery-box {
    border-color: color-mix(in srgb, var(--shadcn-foreground) 45%, transparent);
  }

  .trace-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.75rem;
  }

  .trace-card em {
    display: block;
    color: var(--shadcn-muted-foreground);
    font-size: 0.72rem;
    font-style: normal;
  }

  .trace-detail {
    margin-top: 0.75rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
    padding: 0.75rem;
  }

  .trace-detail-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .trace-stats {
    margin: 0.75rem 0 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .trace-stats dt,
  .trace-stats dd {
    margin: 0;
  }

  .trace-stats dt {
    color: var(--shadcn-muted-foreground);
    font-size: 0.68rem;
  }

  .trace-stats dd {
    color: var(--shadcn-foreground);
    font-size: 0.82rem;
  }

  .trace-evidence {
    margin: 0.65rem 0 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }

  .failure-box strong,
  .recovery-box strong,
  .trace-card strong {
    display: block;
    margin-bottom: 0.35rem;
    color: var(--shadcn-foreground);
  }

  .failure-box p,
  .recovery-box p {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    margin: 0 0 0.65rem;
  }

  .failure-box p.trace-evidence,
  .recovery-box p.trace-evidence {
    margin: 0.65rem 0 0;
  }

  code {
    display: block;
    color: var(--shadcn-foreground);
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }

  .trace-card a,
  .failure-box a,
  .recovery-box a,
  .event-meta a {
    color: var(--shadcn-foreground);
    text-decoration: none;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }

  .trace-card a,
  .failure-box a,
  .recovery-box a {
    display: inline-flex;
    width: fit-content;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0.35rem 0.5rem;
  }

  .trace-placeholder {
    display: inline-flex;
    width: fit-content;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0.35rem 0.5rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  .failure-box a,
  .recovery-box a {
    margin-top: 0.65rem;
  }

  .timeline {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .event-row {
    display: grid;
    grid-template-columns: 12px minmax(0, 1fr);
    gap: 0.65rem;
    color: var(--shadcn-muted-foreground);
  }

  .event-row.active,
  .event-row.done {
    color: var(--shadcn-foreground);
  }

  .event-row.error {
    color: var(--shadcn-destructive);
  }

  .event-marker {
    margin-top: 0.45rem;
    width: 10px;
    height: 10px;
    border: 1px solid currentColor;
    border-radius: 50%;
    background: currentColor;
  }

  .event-body {
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
    padding: 0.75rem;
    min-height: 8rem;
  }

  .event-row.active .event-body,
  .event-row.error .event-body,
  .event-row.done .event-body {
    border-color: currentColor;
  }

  .event-top strong {
    color: var(--shadcn-foreground);
    overflow-wrap: anywhere;
  }

  .event-top span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  .event-meta {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin: 0.35rem 0 0.55rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  .event-body p {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    margin: 0;
  }

  @media (max-width: 1200px) {
    .graph-row,
    .saved-replay-list,
    .story-strip,
    .timeline {
      grid-template-columns: 1fr;
    }

    .node-wrap,
    .node-wrap:last-child {
      grid-template-columns: 1fr;
    }

    .edge {
      display: none;
    }

    .mission-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .mission-page {
      padding: 1rem;
    }

    .strip,
    .metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .trace-card {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .agent-row {
      grid-template-columns: 1fr;
    }
  }
</style>
