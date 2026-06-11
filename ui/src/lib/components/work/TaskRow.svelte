<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";

  export type WorkTask = {
    id?: string;
    pipeline_id?: string;
    stage?: string;
    title?: string;
    description?: string;
    priority?: number;
    created_at_ms?: number;
    updated_at_ms?: number;
    assignments?: any[];
  };

  let {
    task,
    pipelineName = "",
    bucket = "",
  } = $props<{
    task: WorkTask;
    pipelineName?: string;
    bucket?: string;
  }>();

  function timestamp(value?: number): string {
    if (!value) return "-";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "-";
    return new Intl.DateTimeFormat([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function assignmentLabel(item: any): string {
    return String(item?.agent_name || item?.agent_id || item?.agent || item?.role || "").trim();
  }

  const assigneeLabels = $derived(
    Array.isArray(task.assignments)
      ? task.assignments.map(assignmentLabel).filter(Boolean)
      : [],
  );
</script>

<article class="task-row">
  <div class="task-main">
    <div class="task-head">
      <div class="task-title-block">
        {#if bucket}
          <p class="task-bucket">{bucket}</p>
        {/if}
        <h3 title={task.title || task.id || "Task"}>{task.title || task.id || "Task"}</h3>
      </div>
      <div class="task-badges">
        <Badge variant="outline">{String(task.stage || "unassigned")}</Badge>
        {#if Number.isFinite(Number(task.priority))}
          <Badge variant="secondary">p{Number(task.priority)}</Badge>
        {/if}
      </div>
    </div>

    {#if task.description}
      <p class="task-description">{task.description}</p>
    {/if}

    <div class="task-meta">
      <span>{pipelineName || String(task.pipeline_id || "-")}</span>
      <span>Updated {timestamp(task.updated_at_ms || task.created_at_ms)}</span>
    </div>
  </div>

  {#if assigneeLabels.length}
    <div class="task-assignees" aria-label="Task delegates">
      {#each assigneeLabels as assignee (assignee)}
        <Badge variant="secondary">{assignee}</Badge>
      {/each}
    </div>
  {/if}
</article>

<style>
  .task-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: 0.5rem;
    padding: 0.9rem 1rem;
    background: var(--shadcn-background);
  }

  .task-main {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.45rem;
  }

  .task-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .task-title-block {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.2rem;
  }

  .task-bucket {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .task-title-block h3 {
    margin: 0;
    overflow: hidden;
    color: var(--shadcn-foreground);
    font-size: 0.98rem;
    font-weight: 600;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-badges {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.375rem;
  }

  .task-description {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .task-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }

  .task-assignees {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 0.375rem;
  }

  @media (max-width: 720px) {
    .task-head {
      flex-direction: column;
    }

    .task-badges {
      justify-content: flex-start;
    }
  }
</style>
