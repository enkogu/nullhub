<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import TaskRow from "./TaskRow.svelte";

  const { Story } = defineMeta({
    title: "Work/Task Row",
    component: TaskRow,
  });
</script>

{#snippet defaultTemplate()}
  <TaskRow
    task={{
      id: "task-7",
      title: "Prepare launch note",
      description: "Draft the customer-facing summary and handoff notes.",
      pipeline_id: "delivery",
      stage: "in_progress",
      priority: 3,
      updated_at_ms: Date.now(),
      assignments: [{ agent_name: "Writer agent" }],
    }}
    pipelineName="Delivery"
    bucket="Today"
  />
{/snippet}

{#snippet noAssigneeTemplate()}
  <TaskRow
    task={{
      id: "task-11",
      title: "Review evidence pack",
      pipeline_id: "evidence",
      stage: "queued",
      priority: 1,
      updated_at_ms: Date.now(),
    }}
    pipelineName="Evidence"
    bucket="This week"
  />
{/snippet}

<Story name="Today" template={defaultTemplate} />
<Story name="Unassigned" template={noAssigneeTemplate} />
