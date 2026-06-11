<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { attemptNumber, formatDuration, workerId } from "$lib/loops/data";
  import type { LoopRunRow } from "$lib/loops/types";
  import {
    entryBadge,
    entryStatus,
    entryTime,
    formatMs,
    loopName,
    type LoopRunDetailEntry,
  } from "./loopRunDetail";

  let { entry }: { entry: LoopRunDetailEntry } = $props();
</script>

<section class="attempt-summary" aria-label="Attempt summary">
  <div>
    <span>Loop</span>
    <strong>{loopName(entry)}</strong>
  </div>
  <div>
    <span>Status</span>
    <strong><Badge variant={entryBadge(entry)}>{entryStatus(entry)}</Badge></strong>
  </div>
  {#if entry.run}
    <div>
      <span>Attempt</span>
      <strong>{attemptNumber(entry as LoopRunRow)}</strong>
    </div>
    <div>
      <span>Worker</span>
      <strong>{workerId(entry as LoopRunRow)}</strong>
    </div>
    <div>
      <span>Started</span>
      <strong>{formatMs(entry.run.started_at_ms || entryTime(entry))}</strong>
    </div>
    <div>
      <span>Duration</span>
      <strong>{formatDuration(entry as LoopRunRow)}</strong>
    </div>
  {:else}
    <div>
      <span>Created</span>
      <strong>{formatMs(entry.task.created_at_ms)}</strong>
    </div>
    <div>
      <span>Priority</span>
      <strong>{entry.task.priority || 0}</strong>
    </div>
  {/if}
</section>

<style>
  .attempt-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
    gap: 0.5rem;
  }

  .attempt-summary div {
    min-width: 0;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    padding: 0.625rem 0.75rem;
    background: var(--shadcn-muted);
  }

  .attempt-summary span {
    display: block;
    margin-bottom: 0.25rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .attempt-summary strong {
    display: block;
    min-width: 0;
    overflow: hidden;
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
