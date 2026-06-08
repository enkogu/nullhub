<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { OPENAI_COMPATIBLE_VALUE, LOCAL_PROVIDERS, mergeWithManifestOptions } from "$lib/providers";
  import type { ProviderOption } from "$lib/providers";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Select } from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
  import { Card } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";

  let {
    providers = [],
    value = "[]",
    onchange = (v: string) => {},
    component = "",
    validationResults = [] as Array<{ provider: string; live_ok: boolean; reason: string }>,
  } = $props();

  const MODEL_RESULTS_LIMIT = 80;

  // Merge the canonical list with whatever the manifest marks as recommended.
  // This ensures openai-compatible always appears regardless of the manifest.
  const effectiveProviders: ProviderOption[] = $derived(mergeWithManifestOptions(providers));

  type ProviderEntry = {
    provider: string;
    api_key: string;
    model: string;
    base_url: string;
    provider_name: string;
  };

  let savedProviders = $state<any[]>([]);
  let showSavedDropdown = $state(false);
  let savedProvidersRevealed = $state(false);
  let loadingSavedProviders = $state(false);
  let modelDropdownOpen = $state<Record<number, boolean>>({});
  let modelLoadingByKey = $state<Record<string, boolean>>({});
  let modelLoadedByKey = $state<Record<string, boolean>>({});
  let modelOptionsByKey = $state<Record<string, string[]>>({});
  let modelErrorsByKey = $state<Record<string, string>>({});

  const modelBlurTimers = new Map<number, ReturnType<typeof setTimeout>>();

  onMount(async () => {
    try {
      // Fetch revealed keys upfront so the "Use Saved" dropdown is instant on click.
      const data = await api.getSavedProviders(true);
      savedProviders = data.providers || [];
      savedProvidersRevealed = true;
    } catch {}
  });

  onDestroy(() => {
    for (const timer of modelBlurTimers.values()) clearTimeout(timer);
    modelBlurTimers.clear();
  });

  async function toggleSavedDropdown() {
    if (showSavedDropdown) {
      showSavedDropdown = false;
      return;
    }

    if (!savedProvidersRevealed && savedProviders.length > 0) {
      loadingSavedProviders = true;
      try {
        const data = await api.getSavedProviders(true);
        savedProviders = data.providers || [];
        savedProvidersRevealed = true;
      } catch {
        loadingSavedProviders = false;
        return;
      }
      loadingSavedProviders = false;
    }

    showSavedDropdown = true;
  }

  function isPlaceholderEntry(entry: ProviderEntry) {
    return entry.api_key.trim().length === 0 &&
      entry.model.trim().length === 0 &&
      (entry.base_url || "").trim().length === 0 &&
      (entry.provider_name || "").trim().length === 0;
  }

  function useSaved(sp: any) {
    const isCompat = sp.base_url && sp.base_url.length > 0;
    const savedEntry = {
      provider: isCompat ? OPENAI_COMPATIBLE_VALUE : sp.provider,
      api_key: sp.api_key,
      model: sp.model || "",
      base_url: sp.base_url || "",
      provider_name: isCompat ? sp.provider : "",
    };

    if (entries.length === 1 && isPlaceholderEntry(entries[0])) {
      entries = [savedEntry];
    } else {
      entries = [
        ...entries,
        savedEntry,
      ];
    }
    showSavedDropdown = false;
    emitChange();
  }

  let entries = $state<ProviderEntry[]>([]);

  // Sync entries from value prop
  $effect(() => {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        entries = parsed.map((entry: any) => ({
          ...entry,
          base_url: entry.base_url || "",
          provider_name: entry.provider_name || "",
        }));
      }
    } catch {
      entries = [];
    }
  });

  function emitChange() {
    onchange(JSON.stringify(entries));
  }

  function addEntry() {
    // Find recommended provider or first available
    const rec = effectiveProviders.find((p: any) => p.recommended);
    const defaultProvider = rec?.value || effectiveProviders[0]?.value || "";
    entries = [
      ...entries,
      { provider: defaultProvider, api_key: "", model: "", base_url: "", provider_name: "" },
    ];
    emitChange();
  }

  function removeEntry(index: number) {
    entries = entries.filter((_: any, i: number) => i !== index);
    emitChange();
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    const newEntries = [...entries];
    [newEntries[index - 1], newEntries[index]] = [
      newEntries[index],
      newEntries[index - 1],
    ];
    entries = newEntries;
    emitChange();
  }

  function moveDown(index: number) {
    if (index >= entries.length - 1) return;
    const newEntries = [...entries];
    [newEntries[index], newEntries[index + 1]] = [
      newEntries[index + 1],
      newEntries[index],
    ];
    entries = newEntries;
    emitChange();
  }

  function updateEntry(index: number, field: string, val: string) {
    entries = entries.map((e: any, i: number) =>
      i === index ? { ...e, [field]: val } : e,
    );
    emitChange();
  }

  function updateProvider(index: number, provider: string) {
    entries = entries.map((e: any, i: number) => {
      if (i !== index) return e;
      if (provider === OPENAI_COMPATIBLE_VALUE) {
        return { ...e, provider, base_url: e.base_url || "", provider_name: e.provider_name || "" };
      }
      return { ...e, provider, base_url: "", provider_name: "" };
    });
    emitChange();
  }

  function isLocal(provider: string) {
    return LOCAL_PROVIDERS.includes(provider);
  }

  function normalizeRecommendedLabel(label: string) {
    return label
      .replace(/\(\s*recommended\s*\)/gi, "")
      .replace(/,\s*recommended/gi, "")
      .replace(/\s+recommended\s*$/gi, "")
      .replace(/\(\s*,/g, "(")
      .replace(/,\s*\)/g, ")")
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function formatRecommendedLabel(label: string, recommended = false) {
    const cleaned = recommended ? normalizeRecommendedLabel(label) : label;
    return recommended && !/recommended/i.test(cleaned)
      ? `${cleaned} (recommended)`
      : cleaned;
  }

  function modelKey(entry: ProviderEntry) {
    return `${actualProvider(entry)}\u0000${entry.base_url || ""}\u0000${entry.api_key}`;
  }

  function actualProvider(entry: ProviderEntry) {
    return entry.provider === OPENAI_COMPATIBLE_VALUE
      ? (entry.provider_name || "").trim()
      : entry.provider;
  }

  function validationResultForEntry(entry: ProviderEntry) {
    const provider = actualProvider(entry) || entry.provider;
    return validationResults.find((r: any) => r.provider === provider || r.provider === entry.provider);
  }

  function getModelOptions(entry: ProviderEntry) {
    return modelOptionsByKey[modelKey(entry)] || [];
  }

  function getModelError(entry: ProviderEntry) {
    return modelErrorsByKey[modelKey(entry)] || "";
  }

  function isModelLoading(entry: ProviderEntry) {
    return Boolean(modelLoadingByKey[modelKey(entry)]);
  }

  async function ensureModelOptions(entry: ProviderEntry) {
    if (!entry.provider) return;
    // openai-compatible requires a base_url to probe; skip until one is entered.
    if (entry.provider === OPENAI_COMPATIBLE_VALUE && !entry.base_url) return;
    if (entry.provider !== OPENAI_COMPATIBLE_VALUE && !component) return;

    const key = modelKey(entry);
    if (modelLoadingByKey[key] || modelLoadedByKey[key]) return;

    modelLoadingByKey = { ...modelLoadingByKey, [key]: true };
    modelErrorsByKey = { ...modelErrorsByKey, [key]: "" };

    try {
      let models: string[];
      if (entry.provider === OPENAI_COMPATIBLE_VALUE && entry.base_url) {
        const data = await api.probeProviderModels(entry.base_url, entry.api_key || "");
        models = data.live_ok && Array.isArray(data.models) ? data.models : [];
      } else {
        const data = await api.getWizardModels(component, actualProvider(entry), entry.api_key || "");
        models = Array.isArray(data)
          ? data
          : Array.isArray(data?.models)
            ? data.models
            : [];
      }
      const normalized = models.filter((model): model is string => typeof model === "string");
      modelOptionsByKey = { ...modelOptionsByKey, [key]: normalized };
      modelLoadedByKey = { ...modelLoadedByKey, [key]: true };
    } catch (error) {
      modelErrorsByKey = {
        ...modelErrorsByKey,
        [key]: error instanceof Error ? error.message : "Unable to load models",
      };
    } finally {
      modelLoadingByKey = { ...modelLoadingByKey, [key]: false };
    }
  }

  function openModelDropdown(index: number) {
    const timer = modelBlurTimers.get(index);
    if (timer) {
      clearTimeout(timer);
      modelBlurTimers.delete(index);
    }

    modelDropdownOpen = { ...modelDropdownOpen, [index]: true };
    const entry = entries[index];
    if (entry) void ensureModelOptions(entry);
  }

  function closeModelDropdown(index: number) {
    const timer = modelBlurTimers.get(index);
    if (timer) {
      clearTimeout(timer);
      modelBlurTimers.delete(index);
    }

    modelDropdownOpen = { ...modelDropdownOpen, [index]: false };
  }

  function scheduleModelDropdownClose(index: number) {
    const timer = modelBlurTimers.get(index);
    if (timer) clearTimeout(timer);
    modelBlurTimers.set(
      index,
      setTimeout(() => {
        modelDropdownOpen = { ...modelDropdownOpen, [index]: false };
        modelBlurTimers.delete(index);
      }, 150),
    );
  }

  function handleModelInput(index: number, value: string) {
    updateEntry(index, "model", value);
    modelDropdownOpen = { ...modelDropdownOpen, [index]: true };
    const entry = entries[index];
    if (entry) void ensureModelOptions(entry);
  }

  function selectModel(index: number, model: string) {
    updateEntry(index, "model", model);
    closeModelDropdown(index);
  }

  function getFilteredModels(entry: ProviderEntry) {
    const models = getModelOptions(entry);
    const query = entry.model.trim().toLowerCase();
    if (!query) return models.slice(0, MODEL_RESULTS_LIMIT);

    const startsWith = models.filter((model) => model.toLowerCase().startsWith(query));
    const includes = models.filter(
      (model) => !model.toLowerCase().startsWith(query) && model.toLowerCase().includes(query),
    );
    return [...startsWith, ...includes].slice(0, MODEL_RESULTS_LIMIT);
  }

  function getFilteredModelCount(entry: ProviderEntry) {
    const models = getModelOptions(entry);
    const query = entry.model.trim().toLowerCase();
    if (!query) return models.length;
    return models.filter((model) => model.toLowerCase().includes(query)).length;
  }

  function modelPlaceholder(entry: ProviderEntry) {
    if (entry.provider === OPENAI_COMPATIBLE_VALUE) {
      return "e.g. gpt-4o-mini";
    }
    if (entry.provider === "codex-cli" || entry.provider === "openai-codex") {
      return "e.g. gpt-5.4";
    }
    return "e.g. anthropic/claude-sonnet-4";
  }

  function modelFieldHint(entry: ProviderEntry) {
    if (entry.provider === "codex-cli") {
      return "Loads models from your local Codex cache in ~/.codex/models_cache.json.";
    }
    if (entry.provider === "openai-codex") {
      return "Uses ChatGPT/Codex auth from ~/.codex/auth.json. No API key required here.";
    }
    if (entry.provider === OPENAI_COMPATIBLE_VALUE) {
      return "Click to load models from the endpoint, then filter as you type.";
    }
    return "Click to load models, then filter as you type.";
  }
</script>

<div class="provider-list">
  <div class="step-title">Providers</div>
  <p class="step-description">
    Configure AI providers in fallback order. First provider is primary.
  </p>

  {#each entries as entry, i}
    <Card class="provider-row px-5">
      <div class="provider-row-header">
        <span class="provider-number">{i + 1}.</span>
        <Select
          value={entry.provider}
          onchange={(e) => updateProvider(i, e.currentTarget.value)}
        >
          {#each effectiveProviders as opt}
            <option value={opt.value}
              >{formatRecommendedLabel(opt.label, opt.recommended)}</option
            >
          {/each}
        </Select>
        {#each [validationResultForEntry(entry)] as result}
          {#if result}
            <Badge variant={result.live_ok ? "success" : "destructive"} title={result.reason}>
              {result.live_ok ? "Connected" : "Failed"}
            </Badge>
          {/if}
        {/each}
        <div class="provider-row-actions">
          <Button
            variant="ghost"
            size="icon-sm"
            onclick={() => moveUp(i)}
            disabled={i === 0}
            aria-label="Move provider up"
            title="Move up"
          >
            <ArrowUpIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onclick={() => moveDown(i)}
            disabled={i === entries.length - 1}
            aria-label="Move provider down"
            title="Move down"
          >
            <ArrowDownIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            class="danger-icon remove-btn"
            onclick={() => removeEntry(i)}
            aria-label="Remove provider"
            title="Remove"
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>

      {#if !isLocal(entry.provider)}
        <div class="provider-field">
          <Label for={`provider-api-key-${i}`}>API key</Label>
          <Input
            id={`provider-api-key-${i}`}
            type="password"
            value={entry.api_key}
            oninput={(e) => updateEntry(i, "api_key", e.currentTarget.value)}
            placeholder="Enter API key..."
          />
        </div>
      {/if}

      {#if entry.provider === OPENAI_COMPATIBLE_VALUE}
        <div class="provider-field">
          <Label for={`provider-name-${i}`}>Provider name</Label>
          <Input
            id={`provider-name-${i}`}
            type="text"
            value={entry.provider_name}
            oninput={(e) => updateEntry(i, "provider_name", e.currentTarget.value)}
            placeholder="e.g. infini-ai, xiaomi-mimo"
          />
        </div>
        <div class="provider-field">
          <Label for={`provider-base-url-${i}`}>Base URL</Label>
          <Input
            id={`provider-base-url-${i}`}
            type="text"
            value={entry.base_url}
            oninput={(e) => updateEntry(i, "base_url", e.currentTarget.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>
      {/if}

      <div class="provider-field">
        <Label for={`provider-model-${i}`}>Model</Label>
        <div class="model-picker">
          <Input
            id={`provider-model-${i}`}
            type="text"
            value={entry.model}
            oninput={(e) => handleModelInput(i, e.currentTarget.value)}
            onfocus={() => openModelDropdown(i)}
            onblur={() => scheduleModelDropdownClose(i)}
            placeholder={modelPlaceholder(entry)}
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />

          {#if modelDropdownOpen[i]}
            {@const filteredModels = getFilteredModels(entry)}
            {@const totalMatches = getFilteredModelCount(entry)}
            <div class="model-dropdown">
              {#if isModelLoading(entry)}
                <div class="model-empty">Loading models...</div>
              {:else if filteredModels.length > 0}
                {#each filteredModels as model}
                  <button
                    type="button"
                    class="model-option"
                    class:selected={entry.model === model}
                    onmousedown={(event) => {
                      event.preventDefault();
                      selectModel(i, model);
                    }}
                  >
                    <span class="model-value">{model}</span>
                  </button>
                {/each}
                {#if totalMatches > filteredModels.length}
                  <div class="model-summary">
                    Showing {filteredModels.length} of {totalMatches}. Keep typing to narrow.
                  </div>
                {/if}
              {:else if getModelError(entry)}
                <div class="model-empty model-error">
                  {getModelError(entry)}. You can still type a model manually.
                </div>
              {:else if getModelOptions(entry).length > 0}
                <div class="model-empty">No matches for "{entry.model}".</div>
              {:else}
                <div class="model-empty">
                  No model list returned for {entry.provider}. You can still type one manually.
                </div>
              {/if}
            </div>
          {/if}
        </div>
        <div class="provider-field-hint">{modelFieldHint(entry)}</div>
      </div>
    </Card>
  {/each}

  <div class="add-row">
    <Button variant="outline" class="add-btn" onclick={addEntry}>
      <PlusIcon />
      Add provider
    </Button>
    {#if savedProviders.length > 0}
      <div class="saved-dropdown-container">
        <Button variant="secondary" onclick={toggleSavedDropdown} disabled={loadingSavedProviders}>
          {loadingSavedProviders ? "Loading..." : "Use saved"}
        </Button>
        {#if showSavedDropdown}
          <div class="saved-dropdown">
            {#each savedProviders as sp}
              <button class="saved-item" onclick={() => useSaved(sp)}>
                <span class="saved-name">{sp.name}</span>
                <span class="saved-detail">{sp.model || "no model"}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .provider-list {
    margin-bottom: 2rem;
  }

  .step-title {
    display: block;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--shadcn-foreground);
    margin-bottom: 0.25rem;
  }

  .step-description {
    font-size: 0.8rem;
    color: var(--shadcn-muted-foreground);
    margin-bottom: 1rem;
  }

  :global(.provider-row.provider-row) {
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .provider-row-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .provider-number {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--shadcn-muted-foreground);
    min-width: 1.5rem;
    font-family: var(--prin7r-font-mono-standard);
  }

  .provider-row-actions {
    display: flex;
    gap: 0.25rem;
    flex: 0 0 auto;
  }

  :global(.danger-icon) {
    color: var(--shadcn-destructive);
  }
  :global(.danger-icon:hover) {
    color: var(--shadcn-destructive);
  }

  .provider-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .provider-field-hint {
    font-size: 0.72rem;
    color: var(--shadcn-muted-foreground);
  }

  .model-picker {
    position: relative;
  }

  .model-dropdown {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    right: 0;
    max-height: 280px;
    overflow-y: auto;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    background: var(--shadcn-card);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    z-index: 20;
  }

  .model-option {
    display: block;
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: none;
    border: none;
    border-bottom: 1px solid var(--shadcn-border);
    color: var(--shadcn-foreground);
    text-align: left;
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.82rem;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .model-option:last-child {
    border-bottom: none;
  }

  .model-option:hover,
  .model-option.selected {
    background: var(--shadcn-accent);
  }

  .model-value {
    word-break: break-all;
  }

  .model-empty,
  .model-summary {
    padding: 0.75rem;
    font-size: 0.78rem;
    color: var(--shadcn-muted-foreground);
  }

  .model-error {
    color: var(--shadcn-destructive);
  }

  .add-row {
    display: flex;
    gap: 0.5rem;
  }

  :global(.add-btn) {
    flex: 1;
  }

  .saved-dropdown-container {
    position: relative;
    flex: 0 0 auto;
  }

  .saved-dropdown {
    position: absolute;
    bottom: 100%;
    right: 0;
    min-width: 220px;
    background: var(--shadcn-card);
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    margin-bottom: 0.25rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    z-index: 10;
    max-height: 200px;
    overflow-y: auto;
  }

  .saved-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0.625rem 1rem;
    background: none;
    border: none;
    border-bottom: 1px solid var(--shadcn-border);
    color: var(--shadcn-foreground);
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .saved-item:last-child {
    border-bottom: none;
  }

  .saved-item:hover {
    background: var(--shadcn-accent);
  }

  .saved-name {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .saved-detail {
    font-size: 0.75rem;
    color: var(--shadcn-muted-foreground);
    margin-top: 0.125rem;
    font-family: var(--prin7r-font-mono-standard);
  }
</style>
