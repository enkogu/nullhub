<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Select } from '$lib/components/ui/select/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { describeDataStateError } from '$lib/components/DataState.svelte';
  import type { Charter, CharterUpdateInput } from '$lib/api/client';
  import {
    charterStageOptions,
    charterToDraft,
    draftHasReservedCharterMarker,
    draftToCharterInput,
    type CharterEditorDraft,
  } from './charter';

  let {
    charter = null,
    saving = false,
    error = null,
    onCancel,
    onSave,
  }: {
    charter?: Charter | null;
    saving?: boolean;
    error?: unknown;
    onCancel?: () => void;
    onSave?: (input: CharterUpdateInput) => void | Promise<void | Charter>;
  } = $props();

  let form = $state<CharterEditorDraft>(charterToDraft(null));
  let sourceKey = $state('');
  let validationError = $state('');
  let apiError = $derived(error ? describeDataStateError(error, 'Charter could not be saved.') : null);

  function charterKey(value: Charter | null): string {
    if (!value) return 'empty';
    return [
      value.spaceId,
      value.stage,
      value.mission,
      value.autonomyBounds,
      value.autonomyDefaults,
      value.metrics,
      value.docPath,
    ].join('\u001f');
  }

  $effect(() => {
    const nextKey = charterKey(charter);
    if (nextKey === sourceKey) return;
    sourceKey = nextKey;
    form = charterToDraft(charter);
    validationError = '';
  });

  async function submit() {
    validationError = '';
    if (!form.stage.trim()) {
      validationError = 'Stage is required.';
      return;
    }
    if (draftHasReservedCharterMarker(form)) {
      validationError = 'Charter fields cannot contain reserved NULLHUB marker text.';
      return;
    }
    await onSave?.(draftToCharterInput(form));
  }
</script>

<form class="grid gap-4" aria-label="Edit charter" onsubmit={(event) => { event.preventDefault(); void submit(); }}>
  <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
    <div class="grid gap-1.5">
      <Label for="charter-editor-mission">Mission</Label>
      <Input
        id="charter-editor-mission"
        bind:value={form.mission}
        placeholder="Keep operator work visible and reviewed."
        disabled={saving}
      />
    </div>
    <div class="grid gap-1.5">
      <Label for="charter-editor-stage">Stage</Label>
      <Select id="charter-editor-stage" bind:value={form.stage} aria-invalid={Boolean(validationError && !form.stage.trim())} disabled={saving}>
        {#each charterStageOptions as stage (stage.value)}
          <option value={stage.value}>{stage.label}</option>
        {/each}
      </Select>
    </div>
  </div>

  <div class="grid gap-1.5">
    <Label for="charter-editor-autonomy-defaults">Autonomy defaults</Label>
    <Textarea
      id="charter-editor-autonomy-defaults"
      bind:value={form.autonomyDefaults}
      rows={3}
      placeholder="T1 until a policy order raises the tier."
      disabled={saving}
    />
  </div>

  <div class="grid gap-1.5">
    <Label for="charter-editor-autonomy-bounds">Autonomy bounds</Label>
    <Textarea
      id="charter-editor-autonomy-bounds"
      bind:value={form.autonomyBounds}
      rows={4}
      placeholder="Ask before destructive work."
      disabled={saving}
    />
  </div>

  <div class="grid gap-1.5">
    <Label for="charter-editor-metrics">Metrics</Label>
    <Textarea
      id="charter-editor-metrics"
      bind:value={form.metrics}
      rows={3}
      placeholder="open approvals, cycle time, weekly spend"
      disabled={saving}
    />
  </div>

  {#if validationError}
    <p class="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
      {validationError}
    </p>
  {/if}

  {#if apiError}
    <div class="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
      <p>{apiError.message}</p>
      {#if apiError.details}
        <p class="mt-1 text-xs opacity-80">{apiError.details}</p>
      {/if}
    </div>
  {/if}

  <div class="flex flex-wrap justify-end gap-2">
    <Button variant="outline" size="sm" onclick={onCancel} disabled={saving}>Cancel</Button>
    <Button size="sm" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save charter'}</Button>
  </div>
</form>
