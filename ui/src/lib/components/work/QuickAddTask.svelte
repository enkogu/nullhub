<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Select } from "$lib/components/ui/select";
  import { Textarea } from "$lib/components/ui/textarea";
  import DelegateDropdown, { type DelegateOption } from "./DelegateDropdown.svelte";

  export type PipelineOption = {
    value: string;
    label: string;
  };

  let {
    pipelines = [],
    agents = [],
    busy = false,
    disabled = false,
    onSubmit = async () => {},
  } = $props<{
    pipelines?: PipelineOption[];
    agents?: DelegateOption[];
    busy?: boolean;
    disabled?: boolean;
    onSubmit?: (payload: {
      pipelineId: string;
      title: string;
      description: string;
      priority: number;
      delegateAgentId: string;
    }) => Promise<void> | void;
  }>();

  let pipelineId = $state("");
  let title = $state("");
  let description = $state("");
  let priority = $state("0");
  let delegateAgentId = $state("");
  let error = $state("");

  $effect(() => {
    if (!pipelineId && pipelines.length > 0) {
      pipelineId = pipelines[0].value;
    }
  });

  async function submitTask() {
    const trimmedTitle = title.trim();
    const trimmedPipelineId = pipelineId.trim();
    if (!trimmedTitle || !trimmedPipelineId || disabled || busy) return;

    error = "";
    const numericPriority = Number.parseInt(priority || "0", 10);
    try {
      await onSubmit({
        pipelineId: trimmedPipelineId,
        title: trimmedTitle,
        description: description.trim(),
        priority: Number.isFinite(numericPriority) ? numericPriority : 0,
        delegateAgentId: delegateAgentId.trim(),
      });
      title = "";
      description = "";
      priority = "0";
      delegateAgentId = "";
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

<Card class="quick-add-card">
  <div class="quick-add-header">
    <div>
      <h2>Quick add</h2>
      <p>Create a new NullTickets task and delegate it from one place.</p>
    </div>
  </div>

  <div class="quick-add-form">
    <div class="field">
      <Label for="quick-add-pipeline">Pipeline</Label>
      <Select id="quick-add-pipeline" bind:value={pipelineId} disabled={disabled || busy || pipelines.length === 0}>
        {#if pipelines.length === 0}
          <option value="">No pipelines available</option>
        {:else}
          {#each pipelines as pipeline (pipeline.value)}
            <option value={pipeline.value}>{pipeline.label}</option>
          {/each}
        {/if}
      </Select>
    </div>

    <div class="field">
      <Label for="quick-add-title">Task title</Label>
      <Input id="quick-add-title" bind:value={title} placeholder="What needs to happen next?" disabled={disabled || busy} />
    </div>

    <div class="field field-wide">
      <Label for="quick-add-description">Description</Label>
      <Textarea
        id="quick-add-description"
        bind:value={description}
        rows={3}
        placeholder="Add context, constraints, or a handoff note."
        disabled={disabled || busy}
      />
    </div>

    <div class="field">
      <Label for="quick-add-priority">Priority</Label>
      <Input id="quick-add-priority" bind:value={priority} inputmode="numeric" disabled={disabled || busy} />
    </div>

    <DelegateDropdown
      bind:value={delegateAgentId}
      agents={agents}
      disabled={disabled || busy}
      label="Delegate to"
      placeholder="Unassigned"
    />
  </div>

  {#if error}
    <p class="quick-add-error">{error}</p>
  {/if}

  <div class="quick-add-actions">
    <Button
      type="button"
      onclick={submitTask}
      disabled={disabled || busy || !title.trim() || !pipelineId.trim()}
    >
      {busy ? "Creating…" : "Add task"}
    </Button>
  </div>
</Card>

<style>
  .quick-add-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }

  .quick-add-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .quick-add-header h2 {
    margin: 0;
    color: var(--shadcn-foreground);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .quick-add-header p {
    margin: 0.2rem 0 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .quick-add-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem 0.85rem;
  }

  .field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.375rem;
  }

  .field-wide {
    grid-column: 1 / -1;
  }

  .quick-add-error {
    margin: 0;
    color: var(--shadcn-destructive);
    font-size: 0.875rem;
  }

  .quick-add-actions {
    display: flex;
    justify-content: flex-end;
  }

  @media (max-width: 720px) {
    .quick-add-form {
      grid-template-columns: 1fr;
    }
  }
</style>
