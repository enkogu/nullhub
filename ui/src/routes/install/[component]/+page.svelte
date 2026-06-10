<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import AddExistingDialog from '$lib/components/AddExistingDialog.svelte';
  import WizardRenderer from '$lib/components/WizardRenderer.svelte';
  import { api, type StandaloneInfo } from '$lib/api/client';
  import { instanceRoute } from '$lib/nullstack/path';
  import { Card } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';

  let componentName = $derived($page.params.component);
  let wizardData = $state<any>(null);
  let wizardError = $state('');
  let selectedVersion = $state('latest');
  let wizardRequestSeq = 0;
  let standalone = $state<StandaloneInfo | null>(null);
  let standaloneRequestSeq = 0;
  let dialogOpen = $state(false);
  let dialogError = $state('');
  let dialogImporting = $state(false);
  let wizardSteps = $derived(
    (wizardData?.wizard?.steps || wizardData?.steps || []).filter((step: any) => {
      if (step.id === 'gateway_port') return false;
      if (step.id === 'port') return componentName !== 'nullclaw';
      return true;
    }),
  );
  let displayName = $derived(
    typeof wizardData?.display_name === 'string' && wizardData.display_name.length > 0
      ? wizardData.display_name
      : defaultDisplayName(componentName),
  );
  let existingButtonLabel = $derived(
    standalone?.already_imported ? 'Add Another Existing' : 'Add Existing',
  );

  $effect(() => {
    const comp = componentName;
    const version = selectedVersion;
    const requestSeq = ++wizardRequestSeq;
    wizardData = null;
    wizardError = '';
    api.getWizard(comp, version).then((data) => {
      if (requestSeq !== wizardRequestSeq) return;
      if (data?.error) {
        wizardError = data.error;
      } else {
        wizardData = data;
      }
    }).catch((e) => {
      if (requestSeq !== wizardRequestSeq) return;
      wizardError = (e as Error).message;
    });
  });

  $effect(() => {
    const comp = componentName;
    dialogOpen = false;
    dialogError = '';
    standalone = null;
    void refreshStandalone(comp);
  });

  function defaultDisplayName(component: string) {
    const names: Record<string, string> = {
      nullclaw: 'NullClaw',
      nullboiler: 'NullBoiler',
      nulltickets: 'NullTickets',
      nullwatch: 'NullWatch',
    };
    return names[component] || component;
  }

  async function refreshStandalone(component: string): Promise<StandaloneInfo | null> {
    const requestSeq = ++standaloneRequestSeq;
    try {
      const data = await api.getStandalone(component);
      if (requestSeq === standaloneRequestSeq && component === componentName) {
        standalone = data;
      }
      return data;
    } catch (e) {
      if (requestSeq === standaloneRequestSeq && component === componentName) {
        standalone = { standalone: false };
      }
      console.error(e);
      return null;
    }
  }

  async function openExistingDialog() {
    const comp = componentName;
    dialogError = '';
    if (!standalone) {
      await refreshStandalone(comp);
    }
    dialogOpen = true;
  }

  function closeDialog() {
    if (dialogImporting) return;
    dialogOpen = false;
    dialogError = '';
  }

  async function handleExistingSubmit(payload: { path?: string; name?: string }) {
    const comp = componentName;
    dialogImporting = true;
    dialogError = '';
    try {
      const result = await api.importInstance(comp, payload);
      dialogOpen = false;
      await goto(instanceRoute(comp, result?.instance || payload.name || 'default'));
    } catch (e) {
      dialogError = (e as Error).message;
    } finally {
      dialogImporting = false;
    }
  }

  function handleVersionChange(version: string) {
    selectedVersion = version || 'latest';
  }

</script>

<div class="wizard-page">
  <Card class="mb-4 flex-row items-center justify-between gap-4 px-5">
    <div class="min-w-0">
      <div class="text-sm font-medium text-foreground">Already have {displayName}</div>
      <div class="existing-detail mt-1 text-sm text-muted-foreground">
        {#if standalone?.standalone && standalone.standalone_path}
          {#if standalone.already_imported}
            Default install is already added.
          {:else}
            Default install detected at <code>{standalone.standalone_path}</code>
          {/if}
        {:else}
          Add a local {displayName} home.
        {/if}
      </div>
    </div>
    <Button
      variant="outline"
      class="shrink-0"
      onclick={openExistingDialog}
      disabled={dialogImporting}
    >
      {existingButtonLabel}
    </Button>
  </Card>

  {#if wizardError}
    <Card class="items-center px-5 text-center">
      <p class="text-sm text-foreground">{wizardError}</p>
      <div>
        <Button variant="outline" onclick={() => goto('/market')}>Back</Button>
      </div>
    </Card>
  {:else if wizardData}
    <WizardRenderer
      component={componentName}
      steps={wizardSteps}
      onVersionChange={handleVersionChange}
      onComplete={() => goto('/')}
    />
  {:else}
    <p class="text-sm text-muted-foreground">Loading wizard...</p>
  {/if}
</div>

<AddExistingDialog
  open={dialogOpen}
  component={componentName}
  {displayName}
  {standalone}
  importing={dialogImporting}
  error={dialogError}
  onClose={closeDialog}
  onSubmit={handleExistingSubmit}
/>

<style>
  .wizard-page { max-width: 600px; margin: 0 auto; }

  .existing-detail {
    overflow-wrap: anywhere;
  }

  .existing-detail code {
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.8125em;
    color: var(--shadcn-foreground);
  }

  @media (max-width: 640px) {
    .wizard-page :global([data-slot="card"]:first-child) {
      flex-direction: column;
      align-items: stretch;
    }

    .wizard-page :global([data-slot="card"]:first-child [data-slot="button"]) {
      width: 100%;
    }
  }
</style>
