<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { nullBoilerApi } from '$lib/api/client';
  import { nullboilerUiRoutes } from '$lib/nullboiler/routes';
  import BoilerInstanceSelector from '$lib/components/nullboiler/BoilerInstanceSelector.svelte';
  import CheckpointTimeline from '$lib/components/nullboiler/CheckpointTimeline.svelte';
  import StateInspector from '$lib/components/nullboiler/StateInspector.svelte';
  import { PageHeader } from '$lib/components/ui/page-header';
  import { Button } from '$lib/components/ui/button';
  import GitForkIcon from '@lucide/svelte/icons/git-fork';

  let runId = $derived($page.params.id);

  let checkpoints = $state<any[]>([]);
  let selectedCp = $state('');
  let selectedState = $state<any>(null);
  let overridesJson = $state('{}');
  let overridesValid = $state(true);
  let loading = $state(true);
  let forking = $state(false);
  let error = $state<string | null>(null);

  async function loadCheckpoints() {
    loading = true;
    error = null;
    checkpoints = [];
    selectedCp = '';
    selectedState = null;
    try {
      checkpoints = await nullBoilerApi.listCheckpoints(runId) || [];
      if (checkpoints.length > 0) {
        await selectCheckpoint(checkpoints[checkpoints.length - 1].id);
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadCheckpoints();
  });

  async function selectCheckpoint(cpId: string) {
    selectedCp = cpId;
    try {
      const cp = await nullBoilerApi.getCheckpoint(runId, cpId);
      selectedState = cp?.state || cp;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function handleOverridesInput(e: Event) {
    overridesJson = (e.target as HTMLTextAreaElement).value;
    try {
      JSON.parse(overridesJson);
      overridesValid = true;
    } catch {
      overridesValid = false;
    }
  }

  async function forkRun() {
    if (!selectedCp || !overridesValid) return;
    forking = true;
    error = null;
    try {
      const overrides = JSON.parse(overridesJson);
      const result = await nullBoilerApi.forkRun(selectedCp, Object.keys(overrides).length > 0 ? overrides : undefined);
      if (result?.id) {
        await goto(nullboilerUiRoutes.run(result.id));
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      forking = false;
    }
  }

  function runHref(id: string): string {
    return nullboilerUiRoutes.run(id);
  }
</script>

<div class="fork-page">
  <PageHeader title="Fork run" subtitle={`Run ${(runId || '').slice(0, 8)}`}>
    {#snippet controls()}
      <Button variant="ghost" size="sm" href={runHref(runId)}>Back to run</Button>
      <BoilerInstanceSelector onChange={() => { void loadCheckpoints(); }} />
    {/snippet}
    {#snippet actions()}
      <Button size="sm" onclick={forkRun} disabled={!selectedCp || !overridesValid || forking}>
        <GitForkIcon />
        {forking ? 'Forking…' : 'Fork run'}
      </Button>
    {/snippet}
  </PageHeader>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if loading}
    <div class="loading">Loading checkpoints...</div>
  {:else}
    <div class="fork-panels">
      <div class="panel-timeline">
        <div class="panel-label">Checkpoints</div>
        <CheckpointTimeline
          {checkpoints}
          selected={selectedCp}
          onSelect={selectCheckpoint}
        />
      </div>
      <div class="panel-state">
        <div class="state-top">
          <StateInspector currentState={selectedState} />
        </div>
        <div class="state-bottom">
          <label class="override-label" for="overrides">State overrides (JSON)</label>
          <textarea
            id="overrides"
            class="override-editor"
            class:invalid={!overridesValid}
            spellcheck="false"
            value={overridesJson}
            oninput={handleOverridesInput}
          ></textarea>
          {#if !overridesValid}
            <span class="json-err">Invalid JSON</span>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .fork-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: calc(100vh - 3rem);
  }
  .error-banner {
    padding: 0.75rem 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    flex-shrink: 0;
  }
  .fork-panels {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 1rem;
    flex: 1;
    min-height: 0;
  }
  .panel-timeline {
    background: var(--shadcn-card);
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    overflow-y: auto;
  }
  .panel-label {
    padding: 0.625rem 1rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--shadcn-foreground);
    border-bottom: 1px solid var(--shadcn-border);
  }
  .panel-state {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: 0;
  }
  .state-top {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .state-bottom {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    flex-shrink: 0;
  }
  .override-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--shadcn-muted-foreground);
  }
  .override-editor {
    width: 100%;
    min-height: 120px;
    padding: 0.75rem;
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.8125rem;
    line-height: 1.5;
    resize: vertical;
  }
  .override-editor:focus {
    outline: none;
    border-color: var(--shadcn-ring, var(--shadcn-border));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--shadcn-ring, var(--shadcn-border)) 35%, transparent);
  }
  .override-editor.invalid {
    border-color: var(--shadcn-destructive, #dc2626);
  }
  .json-err {
    font-size: 0.75rem;
    color: var(--shadcn-destructive, #dc2626);
  }
  .loading {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--shadcn-muted-foreground);
  }
  @media (max-width: 900px) {
    .fork-panels {
      grid-template-columns: 1fr;
    }
  }
</style>
