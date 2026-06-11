<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import QuickAddTask from "./QuickAddTask.svelte";

  const { Story } = defineMeta({
    title: "Work/Quick Add Task",
    component: QuickAddTask,
  });
</script>

{#snippet defaultTemplate()}
  <QuickAddTask
    pipelines={[
      { value: "delivery", label: "Delivery" },
      { value: "evidence", label: "Evidence" },
    ]}
    agents={[
      { value: "writer", label: "Writer agent", status: "running" },
      { value: "reviewer", label: "Reviewer agent", status: "idle" },
    ]}
  />
{/snippet}

{#snippet emptyTemplate()}
  <QuickAddTask pipelines={[]} agents={[]} disabled busy />
{/snippet}

<Story name="Default" template={defaultTemplate} />
<Story name="Empty" template={emptyTemplate} />
