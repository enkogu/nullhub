<script lang="ts" module>
  export type CharterCardState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';
</script>

<script lang="ts">
  import FileTextIcon from '@lucide/svelte/icons/file-text';
  import GaugeIcon from '@lucide/svelte/icons/gauge';
  import PencilLineIcon from '@lucide/svelte/icons/pencil-line';
  import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Card } from '$lib/components/ui/card/index.js';
  import { Dialog } from '$lib/components/ui/dialog/index.js';
  import DataState, { type DataStateKind } from '$lib/components/DataState.svelte';
  import type { Charter, CharterUpdateInput } from '$lib/api/client';
  import { cn } from '$lib/utils.js';
  import CharterEditor from './CharterEditor.svelte';
  import {
    charterHasEditableContent,
    charterStageLabel,
    charterStageTone,
    firstCharterLine,
    splitCharterLines,
  } from './charter';

  let {
    charter = null,
    state: cardState = 'idle',
    error = null,
    spaceName = '',
    onRetry,
    onSave,
    class: className,
  }: {
    charter?: Charter | null;
    state?: CharterCardState;
    error?: unknown;
    spaceName?: string;
    onRetry?: () => void;
    onSave?: (input: CharterUpdateInput) => void | Promise<void | Charter>;
    class?: string;
  } = $props();

  let editorOpen = $state(false);
  let saving = $state(false);
  let saveError = $state<unknown>(null);

  let isLoading = $derived(cardState === 'idle' || cardState === 'loading');
  let hasContent = $derived(charterHasEditableContent(charter));
  let canEdit = $derived(Boolean(charter && onSave) && !isLoading);
  let dataState = $derived<DataStateKind>(
    isLoading ? 'loading' : cardState === 'error' ? 'error' : hasContent ? 'populated' : 'empty',
  );
  let stageLabel = $derived(charterStageLabel(charter?.stage ?? 'draft'));
  let stageTone = $derived(charterStageTone(charter?.stage ?? 'draft'));
  let mission = $derived(firstCharterLine(charter?.mission ?? '', 'Mission not set'));
  let autonomyDefaults = $derived(firstCharterLine(charter?.autonomyDefaults ?? '', 'T1'));
  let autonomyBounds = $derived(splitCharterLines(charter?.autonomyBounds ?? '', 2));
  let metrics = $derived(splitCharterLines(charter?.metrics ?? '', 3));
  let dialogDescription = $derived(spaceName ? `${spaceName} charter` : 'Space charter');

  function openEditor() {
    if (!canEdit) return;
    saveError = null;
    editorOpen = true;
  }

  async function handleSave(input: CharterUpdateInput) {
    if (!onSave) return;
    saving = true;
    saveError = null;
    try {
      await onSave(input);
      editorOpen = false;
    } catch (error) {
      saveError = error;
    } finally {
      saving = false;
    }
  }
</script>

<Card data-slot="charter-card" class={cn('gap-4 px-5', className)} aria-label="Charter">
  <div class="flex min-w-0 items-start justify-between gap-3">
    <div class="min-w-0 space-y-1">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <h2 class="text-base font-semibold text-foreground">Charter</h2>
        <Badge variant={stageTone}>{stageLabel}</Badge>
      </div>
      <p class="truncate text-xs text-muted-foreground">{charter?.docPath || 'charter.md'}</p>
    </div>
    <Button variant="outline" size="sm" onclick={openEditor} disabled={!canEdit}>
      <PencilLineIcon class="size-4" aria-hidden="true" />
      Edit
    </Button>
  </div>

  <DataState
    state={dataState}
    {error}
    emptyTitle={charter ? 'Charter fields are empty' : 'Select one Space'}
    emptyDescription={charter ? 'Mission, bounds, and metrics are not set for this Space.' : 'Charter is scoped to a single Space.'}
    loadingTitle="Loading charter"
    loadingDescription="Fetching the selected Space charter."
    errorTitle="Charter unavailable"
    errorFallback="The Space charter could not load."
    retryLabel={onRetry ? 'Retry' : undefined}
    {onRetry}
  >
    <div class="grid gap-2" aria-label="Charter summary">
      <div class="rounded-md border px-3 py-2">
        <div class="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
          <FileTextIcon class="size-3.5" aria-hidden="true" />
          Mission
        </div>
        <p class="mt-1 text-sm leading-6 text-foreground">{mission}</p>
      </div>

      <div class="rounded-md border px-3 py-2">
        <div class="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
          <ShieldCheckIcon class="size-3.5" aria-hidden="true" />
          Autonomy
        </div>
        <p class="mt-1 text-sm leading-6 text-foreground">{autonomyDefaults}</p>
        {#if autonomyBounds.length}
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#each autonomyBounds as bound (bound)}
              <Badge variant="outline" class="max-w-full whitespace-normal text-left">{bound}</Badge>
            {/each}
          </div>
        {/if}
      </div>

      <div class="rounded-md border px-3 py-2">
        <div class="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
          <GaugeIcon class="size-3.5" aria-hidden="true" />
          Metrics
        </div>
        {#if metrics.length}
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#each metrics as metric (metric)}
              <Badge variant="secondary" class="max-w-full whitespace-normal text-left">{metric}</Badge>
            {/each}
          </div>
        {:else}
          <p class="mt-1 text-sm leading-6 text-muted-foreground">Metrics not set</p>
        {/if}
      </div>
    </div>
  </DataState>
</Card>

<Dialog bind:open={editorOpen} title="Edit charter" description={dialogDescription} size="lg">
  <CharterEditor
    {charter}
    {saving}
    error={saveError}
    onCancel={() => {
      editorOpen = false;
    }}
    onSave={handleSave}
  />
</Dialog>
