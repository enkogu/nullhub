<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Dialog } from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Select } from "$lib/components/ui/select";
  import { Textarea } from "$lib/components/ui/textarea";
  import { loopMeta } from "$lib/loops/templates";
  import type { LoopPipeline } from "$lib/loops/types";

  let {
    open = $bindable(false),
    pipelines = [],
    preselectedId = "",
    workerRunning = false,
    onstart,
  } = $props<{
    open?: boolean;
    pipelines?: LoopPipeline[];
    preselectedId?: string;
    workerRunning?: boolean;
    onstart: (input: {
      pipelineId: string;
      title: string;
      description: string;
      priority: number;
      startWorker: boolean;
    }) => Promise<void>;
  }>();

  let pipelineId = $state("");
  let title = $state("");
  let description = $state("");
  let priority = $state("50");
  let startWorker = $state(true);
  let submitting = $state(false);
  let error = $state("");

  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) {
      pipelineId = preselectedId || pipelines[0]?.id || "";
      error = "";
    }
    wasOpen = open;
  });

  function selectedGoal(): string {
    const pipeline = pipelines.find((candidate: LoopPipeline) => candidate.id === pipelineId);
    return loopMeta(pipeline)?.goal || "";
  }

  async function submit() {
    if (!pipelineId || !title.trim() || submitting) return;
    submitting = true;
    error = "";
    try {
      await onstart({
        pipelineId,
        title: title.trim(),
        description: description.trim(),
        priority: Number(priority) || 50,
        startWorker: startWorker && !workerRunning,
      });
      open = false;
      title = "";
      description = "";
      priority = "50";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog
  bind:open
  title="Start Loop"
  description="Create a ticket in the selected loop. The agent works it until the exit condition passes."
>
  <div class="field">
    <Label for="start-loop-pipeline">Loop</Label>
    <Select id="start-loop-pipeline" bind:value={pipelineId}>
      {#each pipelines as pipeline (pipeline.id)}
        <option value={pipeline.id}>{pipeline.name}</option>
      {/each}
    </Select>
    {#if selectedGoal()}
      <p class="hint">Goal: {selectedGoal()}</p>
    {/if}
  </div>
  <div class="field">
    <Label for="start-loop-title">Ticket title</Label>
    <Input id="start-loop-title" bind:value={title} placeholder="What should the agent get done?" />
  </div>
  <div class="field">
    <Label for="start-loop-description">Details</Label>
    <Textarea
      id="start-loop-description"
      bind:value={description}
      rows={4}
      placeholder="Context, inputs, and what passing looks like."
    />
  </div>
  <div class="field">
    <Label for="start-loop-priority">Priority</Label>
    <Select id="start-loop-priority" bind:value={priority}>
      <option value="90">High</option>
      <option value="50">Normal</option>
      <option value="10">Low</option>
    </Select>
  </div>
  {#if !workerRunning}
    <label class="worker-toggle">
      <input type="checkbox" bind:checked={startWorker} />
      <span>Start the worker so the ticket is claimed right away</span>
    </label>
  {/if}
  {#if error}
    <p class="error">{error}</p>
  {/if}
  {#snippet footer()}
    <Button variant="outline" size="sm" onclick={() => (open = false)} disabled={submitting}>Cancel</Button>
    <Button size="sm" onclick={submit} disabled={submitting || !pipelineId || !title.trim()}>
      {submitting ? "Starting" : "Start Loop"}
    </Button>
  {/snippet}
</Dialog>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .hint {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }

  .worker-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
  }

  .error {
    margin: 0;
    color: rgb(185 28 28);
    font-size: 0.875rem;
  }
</style>
