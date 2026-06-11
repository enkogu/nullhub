<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import type { LoopRunDetailData, BadgeVariant } from "./loopRunDetail";
  import { extractJudgeDecisions, formatMs } from "./loopRunDetail";

  let { detail = { events: [], artifacts: [] } }: { detail?: LoopRunDetailData } = $props();

  let decisions = $derived(extractJudgeDecisions(detail));

  function variantFor(verdict: string): BadgeVariant {
    const normalized = verdict.toLowerCase();
    if (["pass", "approved", "approve", "success", "accepted", "true"].includes(normalized)) return "success";
    if (["fail", "failed", "rejected", "reject", "false", "blocked"].includes(normalized)) return "destructive";
    if (["warning", "needs_review", "review"].includes(normalized)) return "warning";
    return "outline";
  }
</script>

<section class="judge-decisions" aria-label="Judge decisions">
  <header>
    <h3>Judge decisions</h3>
    <span>{decisions.length}</span>
  </header>
  {#if decisions.length === 0}
    <p class="empty">No judge decisions recorded for this run.</p>
  {:else}
    <ul>
      {#each decisions as decision (decision.id)}
        <li>
          <div class="decision-head">
            <strong>{decision.title}</strong>
            <Badge variant={variantFor(decision.verdict)}>{decision.verdict}</Badge>
          </div>
          <p>{decision.reason || "Decision recorded without a reason."}</p>
          <span>{decision.actor}{decision.tsMs ? ` · ${formatMs(decision.tsMs)}` : ""}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .judge-decisions {
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
  .empty,
  li span,
  li p {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }

  .empty {
    margin: 0;
    padding: 1rem;
  }

  ul {
    display: flex;
    margin: 0;
    flex-direction: column;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.875rem 1rem;
  }

  li + li {
    border-top: 1px solid var(--shadcn-border);
  }

  .decision-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  strong {
    min-width: 0;
    overflow: hidden;
    font-size: 0.875rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 0;
    line-height: 1.45;
  }
</style>
