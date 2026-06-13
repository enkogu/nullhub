<script lang="ts" module>
  export type NewSpaceMode = "empty" | "blueprint";

  export type NewSpaceSubmitInput = {
    name: string;
    mode: NewSpaceMode;
    blueprintId?: string;
  };
</script>

<script lang="ts">
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import Building2Icon from "@lucide/svelte/icons/building-2";
  import CheckIcon from "@lucide/svelte/icons/check";
  import LayersIcon from "@lucide/svelte/icons/layers";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import type { PackageManifest } from "$lib/api/packages";
  import DataState, { type DataStateKind } from "$lib/components/DataState.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { cn } from "$lib/utils.js";

  let {
    blueprints = [],
    state: viewState = "populated",
    error = null,
    submitting = false,
    submitError = "",
    initialMode = "empty",
    onSubmit,
    onRetry,
  }: {
    blueprints?: PackageManifest[];
    state?: DataStateKind;
    error?: unknown;
    submitting?: boolean;
    submitError?: string;
    initialMode?: NewSpaceMode;
    onSubmit?: (input: NewSpaceSubmitInput) => Promise<void> | void;
    onRetry?: () => void;
  } = $props();

  let name = $state("");
  let mode = $state<NewSpaceMode>("empty");
  let selectedBlueprintId = $state("");
  let seededInitialMode = $state(false);
  let selectedBlueprint = $derived(blueprints.find((blueprint) => blueprint.id === selectedBlueprintId) ?? null);
  let nameError = $derived(name.trim().length === 0 ? "Space name is required." : "");
  let blueprintError = $derived(mode === "blueprint" && !selectedBlueprint ? "Choose one Blueprint." : "");
  let canSubmit = $derived(Boolean(name.trim()) && !blueprintError && !submitting);
  let submitLabel = $derived(
    submitting
      ? "Creating..."
      : mode === "blueprint"
        ? "Create and open installer"
        : "Create empty Space",
  );

  $effect(() => {
    if (seededInitialMode) return;
    mode = initialMode;
    seededInitialMode = true;
  });

  $effect(() => {
    if (mode !== "blueprint") return;
    if (selectedBlueprintId && blueprints.some((blueprint) => blueprint.id === selectedBlueprintId)) return;
    selectedBlueprintId = blueprints[0]?.id ?? "";
  });

  function chooseMode(nextMode: NewSpaceMode) {
    mode = nextMode;
    if (nextMode === "blueprint" && !selectedBlueprintId) {
      selectedBlueprintId = blueprints[0]?.id ?? "";
    }
  }

  function chooseBlueprint(blueprintId: string) {
    selectedBlueprintId = blueprintId;
    mode = "blueprint";
  }

  function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName || !canSubmit) return;
    void onSubmit?.({
      name: trimmedName,
      mode,
      blueprintId: mode === "blueprint" ? selectedBlueprint?.id : undefined,
    });
  }
</script>

<section class="new-space-flow" data-slot="new-space-flow">
  <PageHeader
    title="New Space"
    subtitle="Start with a blank scoped workspace or stage a Blueprint through the installer."
    align="start"
  />

  <form class="new-space-form" onsubmit={(event) => { event.preventDefault(); handleSubmit(); }}>
    <div class="field-grid">
      <Label for="new-space-name">Space name</Label>
      <Input
        id="new-space-name"
        bind:value={name}
        placeholder="Operations"
        autocomplete="off"
        aria-invalid={Boolean(nameError && name.length > 0)}
        aria-describedby="new-space-name-help"
      />
      <p id="new-space-name-help" class="field-note">Used across scoped work, orders, and settings.</p>
    </div>

    <div class="mode-grid" role="radiogroup" aria-label="Space start mode">
      <button
        type="button"
        class={cn("mode-card", mode === "empty" && "selected")}
        aria-checked={mode === "empty"}
        role="radio"
        onclick={() => chooseMode("empty")}
      >
        <span class="mode-icon">
          <PlusIcon class="size-4" aria-hidden="true" />
        </span>
        <span class="mode-copy">
          <span class="mode-title">Empty Space</span>
          <span class="mode-detail">No installed packages.</span>
        </span>
        {#if mode === "empty"}
          <CheckIcon class="selected-icon size-4" aria-hidden="true" />
        {/if}
      </button>

      <button
        type="button"
        class={cn("mode-card", mode === "blueprint" && "selected")}
        aria-checked={mode === "blueprint"}
        role="radio"
        onclick={() => chooseMode("blueprint")}
      >
        <span class="mode-icon">
          <SparklesIcon class="size-4" aria-hidden="true" />
        </span>
        <span class="mode-copy">
          <span class="mode-title">From Blueprint</span>
          <span class="mode-detail">Open install review after creation.</span>
        </span>
        {#if mode === "blueprint"}
          <CheckIcon class="selected-icon size-4" aria-hidden="true" />
        {/if}
      </button>
    </div>

    {#if mode === "blueprint"}
      <DataState
        state={viewState}
        {error}
        loadingTitle="Loading Blueprints"
        loadingDescription="Reading the built-in catalog."
        emptyTitle="No Blueprints available"
        emptyDescription="Create an empty Space for now."
        errorTitle="Blueprints unavailable"
        retryLabel="Retry"
        onRetry={onRetry}
      >
        <div class="blueprint-grid" aria-label="Blueprints">
          {#each blueprints as blueprint (blueprint.id)}
            <button
              type="button"
              class={cn("blueprint-card", selectedBlueprintId === blueprint.id && "selected")}
              aria-pressed={selectedBlueprintId === blueprint.id}
              onclick={() => chooseBlueprint(blueprint.id)}
            >
              <span class="blueprint-head">
                <span class="blueprint-icon">
                  <Building2Icon class="size-4" aria-hidden="true" />
                </span>
                <span class="blueprint-title">{blueprint.name}</span>
                {#if selectedBlueprintId === blueprint.id}
                  <CheckIcon class="selected-icon size-4" aria-hidden="true" />
                {/if}
              </span>
              <span class="blueprint-summary">{blueprint.summary}</span>
              <span class="blueprint-meta">
                <Badge variant="secondary">{blueprint.stageLabel}</Badge>
                <Badge variant="outline">
                  <LayersIcon class="size-3" aria-hidden="true" />
                  {blueprint.contributes.length} changes
                </Badge>
              </span>
            </button>
          {/each}
        </div>
      </DataState>
    {/if}

    {#if submitError}
      <p class="submit-error" role="alert">{submitError}</p>
    {:else if blueprintError}
      <p class="submit-error" role="alert">{blueprintError}</p>
    {/if}

    <div class="actions">
      <Button href="/" variant="outline">Cancel</Button>
      <Button type="submit" disabled={!canSubmit}>
        {submitLabel}
        {#if !submitting}
          <ArrowRightIcon class="size-4" aria-hidden="true" />
        {/if}
      </Button>
    </div>
  </form>
</section>

<style>
  .new-space-flow {
    display: grid;
    gap: 1.25rem;
    max-width: 960px;
  }

  .new-space-form {
    display: grid;
    gap: 1rem;
  }

  .field-grid {
    display: grid;
    gap: 0.5rem;
    max-width: 32rem;
  }

  .field-note {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    line-height: 1.35;
  }

  .mode-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .mode-card,
  .blueprint-card {
    min-width: 0;
    border: 1px solid var(--shadcn-border);
    border-radius: 8px;
    background: var(--shadcn-card);
    color: var(--shadcn-card-foreground);
    text-align: left;
    transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
  }

  .mode-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    min-height: 5rem;
    padding: 1rem;
  }

  .mode-card:hover,
  .blueprint-card:hover {
    background: var(--shadcn-accent);
  }

  .mode-card.selected,
  .blueprint-card.selected {
    border-color: var(--shadcn-primary);
    box-shadow: 0 0 0 1px var(--shadcn-primary);
  }

  .mode-icon,
  .blueprint-icon {
    display: inline-flex;
    width: 2rem;
    height: 2rem;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--shadcn-border);
    border-radius: 8px;
    background: var(--shadcn-background);
    color: var(--shadcn-muted-foreground);
  }

  .mode-copy {
    display: grid;
    min-width: 0;
    gap: 0.25rem;
  }

  .mode-title,
  .blueprint-title {
    color: var(--shadcn-foreground);
    font-size: 0.9375rem;
    font-weight: 650;
    line-height: 1.35;
  }

  .mode-detail,
  .blueprint-summary {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    line-height: 1.45;
  }

  .selected-icon {
    color: var(--shadcn-primary);
  }

  .blueprint-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
    gap: 0.75rem;
  }

  .blueprint-card {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
  }

  .blueprint-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.625rem;
  }

  .blueprint-summary {
    min-height: 2.4rem;
  }

  .blueprint-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .submit-error {
    color: var(--shadcn-destructive);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.625rem;
    padding-top: 0.25rem;
  }

  @media (max-width: 640px) {
    .mode-grid {
      grid-template-columns: 1fr;
    }

    .actions {
      justify-content: stretch;
    }

    .actions :global([data-slot="button"]) {
      width: 100%;
    }
  }
</style>
