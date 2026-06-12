<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { nullBoilerApi } from '$lib/api/client';
  import { nullboilerUiRoutes } from '$lib/nullboiler/routes';
  import BoilerInstanceSelector from '$lib/components/nullboiler/BoilerInstanceSelector.svelte';
  import GraphViewer from '$lib/components/nullboiler/GraphViewer.svelte';
  import WorkflowJsonEditor from '$lib/components/nullboiler/WorkflowJsonEditor.svelte';
  import { PageHeader } from '$lib/components/ui/page-header';
  import { Button } from '$lib/components/ui/button';
  import CheckIcon from '@lucide/svelte/icons/check';
  import SaveIcon from '@lucide/svelte/icons/save';
  import PlayIcon from '@lucide/svelte/icons/play';

  let id = $derived($page.params.id);
  let isNew = $derived(id === 'new');

  const emptyWorkflow = {
    id: '',
    name: '',
    state_schema: {},
    nodes: {},
    edges: [],
  };

  let jsonValue = $state(JSON.stringify(emptyWorkflow, null, 2));
  let parsedWorkflow = $state<any>(emptyWorkflow);
  let parseError = $state('');
  let loading = $state(true);
  let error = $state<string | null>(null);
  let saving = $state(false);
  let validating = $state(false);
  let validationResult = $state<{ valid: boolean; errors?: string[] } | null>(null);

  async function loadWorkflow() {
    loading = true;
    error = null;
    validationResult = null;
    if (isNew) {
      parsedWorkflow = emptyWorkflow;
      jsonValue = JSON.stringify(emptyWorkflow, null, 2);
      loading = false;
      return;
    }

    try {
      const wf = await nullBoilerApi.getWorkflow(id);
      parsedWorkflow = wf;
      jsonValue = JSON.stringify(wf, null, 2);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadWorkflow();
  });

  function handleBoilerChange() {
    void loadWorkflow();
  }

  function onJsonChange() {
    try {
      parsedWorkflow = JSON.parse(jsonValue);
      parseError = '';
    } catch (e) {
      parseError = (e as Error).message;
    }
  }

  $effect(() => {
    jsonValue;
    onJsonChange();
  });

  async function validate() {
    if (isNew) return;
    validating = true;
    validationResult = null;
    try {
      const result = await nullBoilerApi.validateWorkflow(id);
      validationResult = result;
    } catch (e) {
      validationResult = { valid: false, errors: [(e as Error).message] };
    } finally {
      validating = false;
    }
  }

  async function save() {
    if (parseError) return;
    saving = true;
    error = null;
    try {
      if (isNew) {
        const result = await nullBoilerApi.createWorkflow(parsedWorkflow);
        await goto(nullboilerUiRoutes.workflow(result.id || parsedWorkflow.id));
      } else {
        await nullBoilerApi.updateWorkflow(id, parsedWorkflow);
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function run() {
    if (parseError || isNew) return;
    try {
      const result = await nullBoilerApi.runWorkflow(id, {});
      if (result?.id) {
        await goto(nullboilerUiRoutes.run(result.id));
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

<div class="editor-page">
  <PageHeader title={isNew ? 'New workflow' : (parsedWorkflow?.name || id)} subtitle="Workflow">
    {#snippet controls()}
      <BoilerInstanceSelector onChange={handleBoilerChange} />
    {/snippet}
    {#snippet actions()}
      {#if !isNew}
        <Button
          variant="outline"
          size="icon-sm"
          onclick={validate}
          disabled={validating || !!parseError}
          title={validating ? 'Validating…' : 'Validate'}
          aria-label="Validate workflow"
        >
          <CheckIcon />
        </Button>
      {/if}
      <Button
        variant="outline"
        size="icon-sm"
        onclick={save}
        disabled={saving || !!parseError}
        title={saving ? 'Saving…' : 'Save'}
        aria-label="Save workflow"
      >
        <SaveIcon />
      </Button>
      {#if !isNew}
        <Button
          size="icon-sm"
          onclick={run}
          disabled={!!parseError}
          title="Run"
          aria-label="Run workflow"
        >
          <PlayIcon />
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if validationResult}
    <div class="validation-result" class:valid={validationResult.valid} class:invalid={!validationResult.valid}>
      {#if validationResult.valid}
        Workflow is valid.
      {:else}
        <strong>Validation errors:</strong>
        {#each validationResult.errors || [] as err}
          <div class="val-err">{err}</div>
        {/each}
      {/if}
    </div>
  {/if}

  {#if loading}
    <div class="loading">Loading workflow...</div>
  {:else}
    <div class="editor-panels">
      <div class="panel-graph">
        <GraphViewer workflow={parsedWorkflow} nodeStatus={{}} />
      </div>
      <div class="panel-json">
        <WorkflowJsonEditor bind:value={jsonValue} onerror={(msg) => parseError = msg} />
      </div>
    </div>
  {/if}
</div>

<style>
  .editor-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: calc(100vh - 3rem);
  }
  .editor-panels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    flex: 1;
    min-height: 0;
  }
  .panel-graph {
    overflow: auto;
    min-height: 0;
  }
  .panel-json {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .error-banner {
    padding: 0.75rem 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
  }
  .validation-result {
    padding: 0.625rem 1rem;
    border-radius: var(--shadcn-radius);
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-card);
    color: var(--shadcn-foreground);
    font-size: 0.8125rem;
  }
  .validation-result.valid {
    border-color: var(--shadcn-border);
    color: var(--shadcn-foreground);
  }
  .validation-result.invalid {
    border-color: color-mix(in srgb, var(--shadcn-destructive, #dc2626) 45%, var(--shadcn-border));
    color: var(--shadcn-destructive, #dc2626);
  }
  .val-err {
    margin-top: 0.25rem;
    padding-left: 1rem;
  }
  .loading {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--shadcn-muted-foreground);
  }
  @media (max-width: 900px) {
    .editor-panels {
      grid-template-columns: 1fr;
    }
  }
</style>
