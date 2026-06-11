<script lang="ts">
  import { formatCost, formatTokens, summarizeCost, type LoopRunDetailData, type LoopRunDetailEntry } from "./loopRunDetail";

  let {
    detail = { events: [], artifacts: [] },
    entry = null,
  }: {
    detail?: LoopRunDetailData;
    entry?: LoopRunDetailEntry | null;
  } = $props();

  let summary = $derived(summarizeCost(detail, entry));
</script>

<section class="cost-summary" aria-label="Cost summary">
  <header>
    <h3>Cost</h3>
    {#if summary.available}
      <span>{summary.requests || 1} request{(summary.requests || 1) === 1 ? "" : "s"}</span>
    {:else}
      <span>Unknown</span>
    {/if}
  </header>
  <div class="metrics">
    <div>
      <span>Total tokens</span>
      <strong>{summary.available ? formatTokens(summary.totalTokens) : "Unknown"}</strong>
    </div>
    <div>
      <span>Input</span>
      <strong>{summary.available ? formatTokens(summary.promptTokens) : "Unknown"}</strong>
    </div>
    <div>
      <span>Output</span>
      <strong>{summary.available ? formatTokens(summary.completionTokens) : "Unknown"}</strong>
    </div>
    <div>
      <span>Cost</span>
      <strong>{formatCost(summary.costUsd)}</strong>
    </div>
  </div>
  {#if summary.model}
    <p>{summary.model}</p>
  {:else if !summary.available}
    <p>No trusted usage metadata is attached to this run.</p>
  {/if}
</section>

<style>
  .cost-summary {
    overflow: hidden;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    border-bottom: 1px solid var(--shadcn-border);
    padding: 0.75rem 1rem;
  }

  h3 {
    margin: 0;
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    font-weight: 600;
  }

  header span,
  .metrics span,
  p {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    gap: 0.75rem;
    padding: 1rem;
  }

  .metrics div {
    min-width: 0;
  }

  .metrics span {
    display: block;
    margin-bottom: 0.25rem;
  }

  strong {
    display: block;
    overflow: hidden;
    color: var(--shadcn-foreground);
    font-size: 0.95rem;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: -0.25rem 1rem 1rem;
  }
</style>
