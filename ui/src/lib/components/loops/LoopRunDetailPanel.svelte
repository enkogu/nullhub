<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import LoopRunAttemptSummary from "./LoopRunAttemptSummary.svelte";
  import LoopRunCheckOutput from "./LoopRunCheckOutput.svelte";
  import LoopRunCostSummary from "./LoopRunCostSummary.svelte";
  import LoopRunJudgeDecisions from "./LoopRunJudgeDecisions.svelte";
  import LoopRunTimeline from "./LoopRunTimeline.svelte";
  import {
    detailFailureReason,
    entryBadge,
    entryBucket,
    entryStatus,
    entryTime,
    formatBytes,
    formatMs,
    loopName,
    type LoopAgentResult,
    type LoopRunDetailData,
    type LoopRunDetailEntry,
  } from "./loopRunDetail";

  let {
    entry = null,
    detail = { events: [], artifacts: [] },
    agentResult = null,
    agentResultLoading = false,
    agentResultError = "",
    actionLoading = "",
    onRunAgain,
  }: {
    entry?: LoopRunDetailEntry | null;
    detail?: LoopRunDetailData;
    agentResult?: LoopAgentResult | null;
    agentResultLoading?: boolean;
    agentResultError?: string;
    actionLoading?: string;
    onRunAgain?: (entry: LoopRunDetailEntry) => void;
  } = $props();
</script>

<Card class="run-detail">
  {#if !entry}
    <div class="empty-inline">Select a run to inspect it.</div>
  {:else}
    <div class="detail-head">
      <h2>{entry.task.title}</h2>
      <div class="detail-badges">
        <Badge variant={entryBadge(entry)}>{entryStatus(entry)}</Badge>
      </div>
      <p class="detail-sub">
        {loopName(entry)}
        {#if entry.run}
          · {formatMs(entryTime(entry))}
        {:else}
          · created {formatMs(entry.task.created_at_ms)}
        {/if}
      </p>
    </div>

    {#if entry.task.description}
      <p class="detail-description">{entry.task.description}</p>
    {/if}

    <LoopRunAttemptSummary {entry} />

    {#if entry.run && entryBucket(entry) === "attention"}
      <div class="alert alert-error detail-failure">{detailFailureReason(entry)}</div>
    {/if}

    {#if !entry.run}
      <div class="alert alert-warning">
        Waiting to be claimed. The worker picks up eligible tickets in priority order.
      </div>
    {/if}

    {#if entry.run && entryBucket(entry) !== "active" && onRunAgain}
      <div class="detail-actions">
        <Button size="sm" onclick={() => onRunAgain?.(entry)} disabled={actionLoading === "again"}>
          {actionLoading === "again" ? "Creating" : "Run again"}
        </Button>
      </div>
    {/if}

    {#if entry.run}
      <LoopRunCheckOutput {detail} {entry} {agentResult} loading={agentResultLoading} error={agentResultError} />
      <LoopRunTimeline events={detail.events} />
      <LoopRunJudgeDecisions {detail} />
      <LoopRunCostSummary {detail} {entry} />

      <section class="detail-section">
        <h3>Artifacts</h3>
        {#if detail.artifacts.length === 0}
          <p class="empty-inline">No artifacts recorded for this run.</p>
        {:else}
          <ul class="artifact-list">
            {#each detail.artifacts as artifact (artifact.id)}
              <li>
                <Badge variant="outline">{artifact.kind.replaceAll("_", " ")}</Badge>
                <span>{artifact.uri}{formatBytes(artifact.size_bytes) ? ` · ${formatBytes(artifact.size_bytes)}` : ""}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <details class="advanced">
        <summary>Advanced</summary>
        <pre>{JSON.stringify({ task: entry.task, run: entry.run, events: detail.events, artifacts: detail.artifacts }, null, 2)}</pre>
      </details>
    {/if}
  {/if}
</Card>

<style>
  :global(.run-detail) {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }

  .alert {
    border-radius: var(--shadcn-radius);
    border: 1px solid var(--shadcn-border);
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
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

  .detail-head {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .detail-head h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.35;
  }

  .detail-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .detail-sub {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }

  .detail-description {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .detail-failure {
    font-size: 0.8125rem;
  }

  .detail-actions {
    display: flex;
    gap: 0.5rem;
  }

  .detail-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .detail-section h3 {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .artifact-list {
    display: flex;
    margin: 0;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0;
    list-style: none;
  }

  .artifact-list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }

  .artifact-list span {
    overflow: hidden;
    color: var(--shadcn-muted-foreground);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .advanced summary {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .advanced pre {
    margin: 0.5rem 0 0;
    max-height: 20rem;
    overflow: auto;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    padding: 0.75rem;
    background: var(--shadcn-muted);
    font-size: 0.75rem;
  }

  .empty-inline {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }
</style>
