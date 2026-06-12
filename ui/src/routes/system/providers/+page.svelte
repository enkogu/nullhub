<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { PROVIDER_OPTIONS, OPENAI_COMPATIBLE_VALUE, LOCAL_PROVIDERS, KNOWN_PROVIDER_VALUES } from "$lib/providers";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";
  import { Dialog } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Select } from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";

  let providers = $state<any[]>([]);
  let loading = $state(true);
  let error = $state("");
  let message = $state("");
  let messageTone = $state<"success" | "error">("success");
  let messageTimer: ReturnType<typeof setTimeout> | null = null;

  // Add form state
  let showAddForm = $state(false);
  let addForm = $state({ provider: "openrouter", provider_name: "", api_key: "", model: "", base_url: "" });
  let addValidating = $state(false);
  let addError = $state("");
  let addProbing = $state(false);
  let addProbedModels = $state<string[]>([]);
  let addProbeError = $state("");

  // Edit state
  let editingId = $state<string | null>(null);
  let editForm = $state({ name: "", api_key: "", model: "", base_url: "" });
  let editRealApiKey = $state(""); // revealed key fetched on edit open; used by Fetch Models when form field is blank
  let editValidating = $state(false);
  let editError = $state("");
  let editProbing = $state(false);
  let editProbedModels = $state<string[]>([]);
  let editProbeError = $state("");

  // Re-validate state
  let revalidatingId = $state<string | null>(null);

  const providerColumns: EntityColumn[] = [
    { id: "provider", label: "Provider", type: "select", width: "minmax(150px,.55fr)" },
    { id: "validation", label: "Validation", type: "status", width: "minmax(130px,.45fr)" },
    { id: "model", label: "Model", type: "mono", width: "minmax(220px,1fr)" },
    { id: "base_url", label: "Base URL", type: "mono", width: "minmax(220px,1fr)" },
    { id: "last_validation", label: "Last Validation", type: "date", width: "minmax(150px,.55fr)" },
    { id: "local", label: "Local", type: "select", width: "minmax(90px,.3fr)", cardHidden: true },
  ];
  const providerViews = createViewSet({
    kanban: { groupBy: "validation" },
    tree: { parentField: "provider_key" },
    timeline: { dateField: "last_validation" },
    calendar: { dateField: "last_validation" },
  });
  const providerActions: EntityViewAction[] = [
    {
      id: "revalidate",
      label: "Re-validate",
      run: async (record) => {
        if (revalidatingId) return;
        await handleRevalidate(String((record.raw as any)?.id || record.id.replace("provider:", "")));
      },
    },
    { id: "edit", label: "Edit", run: (record) => startEdit(record.raw) },
    {
      id: "delete",
      label: "Delete",
      variant: "destructive",
      run: async (record) => handleDelete(String((record.raw as any)?.id || record.id.replace("provider:", ""))),
    },
  ];

  let editingProvider = $derived(providers.find((provider) => provider.id === editingId) || null);
  let providerRecords = $derived(
    providers.map((provider) => {
      const validation = providerValidationLabel(providerIndicatorState(provider));
      const lastValidation = lastValidationAt(provider);
      return {
        id: `provider:${provider.id}`,
        title: provider.name,
        type: getProviderLabel(provider.provider),
        status: validation,
        subtitle: provider.model || "No default model",
        description: provider.base_url || "Saved model provider",
        date: lastValidation,
        fields: {
          provider: getProviderLabel(provider.provider),
          provider_key: provider.provider,
          validation,
          api_key: provider.api_key,
          model: provider.model || "No default model",
          base_url: provider.base_url || "-",
          last_successful: provider.validated_at || "",
          last_validation: lastValidation,
          local: isLocal(provider.provider) ? "yes" : "no",
        },
        raw: provider,
      };
    }) satisfies EntityRecord[],
  );

  onMount(async () => {
    await loadProviders();
  });

  onDestroy(() => {
    if (messageTimer) clearTimeout(messageTimer);
  });

  function flashMessage(text: string, tone: "success" | "error" = "success", timeoutMs = 3000) {
    message = text;
    messageTone = tone;
    if (messageTimer) clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      message = "";
      messageTimer = null;
    }, timeoutMs);
  }

  async function loadProviders() {
    loading = true;
    error = "";
    try {
      const data = await api.getSavedProviders();
      providers = data.providers || [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function openAdd() {
    addForm = { provider: "openrouter", provider_name: "", api_key: "", model: "", base_url: "" };
    addProbedModels = [];
    addProbeError = "";
    addError = "";
    showAddForm = true;
  }

  async function fetchAddModels() {
    addProbing = true;
    addProbeError = "";
    addProbedModels = [];
    try {
      const result = await api.probeProviderModels(addForm.base_url.trim(), addForm.api_key.trim());
      if (result.live_ok) {
        addProbedModels = result.models;
        if (!addProbedModels.length) addProbeError = "Connected, but no models returned.";
      } else {
        addProbeError = result.reason || "Could not reach endpoint.";
      }
    } catch (e) {
      addProbeError = (e as Error).message;
    } finally {
      addProbing = false;
    }
  }

  async function fetchEditModels() {
    editProbing = true;
    editProbeError = "";
    editProbedModels = [];
    try {
      const keyToUse = editForm.api_key.trim() || editRealApiKey;
      const result = await api.probeProviderModels(editForm.base_url.trim(), keyToUse);
      if (result.live_ok) {
        editProbedModels = result.models;
        if (!editProbedModels.length) editProbeError = "Connected, but no models returned.";
      } else {
        editProbeError = result.reason || "Could not reach endpoint.";
      }
    } catch (e) {
      editProbeError = (e as Error).message;
    } finally {
      editProbing = false;
    }
  }

  async function handleAdd() {
    addValidating = true;
    addError = "";
    try {
      const isCustom = addForm.provider === OPENAI_COMPATIBLE_VALUE;
      const providerValue = addForm.provider === OPENAI_COMPATIBLE_VALUE
        ? addForm.provider_name.trim()
        : addForm.provider;
      const baseUrl = addForm.base_url.trim();
      if (isCustom && !providerValue) {
        addError = "Provider name is required for OpenAI Compatible providers.";
        addValidating = false;
        return;
      }
      if (isCustom && !baseUrl) {
        addError = "Base URL is required for OpenAI Compatible providers.";
        addValidating = false;
        return;
      }
      await api.createSavedProvider({
        provider: providerValue,
        api_key: addForm.api_key,
        model: addForm.model || undefined,
        base_url: isCustom ? baseUrl : undefined,
      });
      showAddForm = false;
      addForm = { provider: "openrouter", provider_name: "", api_key: "", model: "", base_url: "" };
      addProbedModels = [];
      addProbeError = "";
      flashMessage("Provider saved");
      await loadProviders();
    } catch (e) {
      addError = (e as Error).message;
    } finally {
      addValidating = false;
    }
  }

  function startEdit(p: any) {
    editingId = p.id;
    editForm = { name: p.name, api_key: "", model: p.model, base_url: p.base_url || "" };
    editRealApiKey = "";
    editProbedModels = [];
    editProbeError = "";
    editError = "";
    // Fetch the real (revealed) key so Fetch Models works without the user re-entering the key
    api.getSavedProviders(true).then(data => {
      const found = (data.providers || []).find((x: any) => x.id === p.id);
      if (found) editRealApiKey = found.api_key || "";
    }).catch(() => {});
  }

  function cancelEdit() {
    editingId = null;
  }

  async function saveEdit(id: string) {
    editValidating = true;
    editError = "";
    try {
      const payload: any = {};
      if (editForm.name) payload.name = editForm.name;
      if (editForm.api_key) payload.api_key = editForm.api_key;
      payload.model = editForm.model;
      payload.base_url = editForm.base_url.trim();
      await api.updateSavedProvider(id, payload);
      editingId = null;
      flashMessage("Provider updated");
      await loadProviders();
    } catch (e) {
      editError = (e as Error).message;
      await loadProviders();
    } finally {
      editValidating = false;
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteSavedProvider(id);
      flashMessage("Provider deleted");
      await loadProviders();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function handleRevalidate(id: string) {
    revalidatingId = id;
    try {
      await api.revalidateSavedProvider(id);
      flashMessage("Validation passed", "success", 5000);
    } catch (e) {
      flashMessage(`Validation failed: ${(e as Error).message}`, "error", 5000);
    } finally {
      await loadProviders();
      revalidatingId = null;
    }
  }

  function isLocal(provider: string) {
    return LOCAL_PROVIDERS.includes(provider);
  }

  // A provider is "custom" if its type is not one of the built-in nullclaw-known providers.
  // This determines whether the base_url / Fetch Models fields appear in edit form.
  function isCustomProvider(p: any) {
    return !KNOWN_PROVIDER_VALUES.has(p.provider);
  }

  function getProviderLabel(value: string) {
    return PROVIDER_OPTIONS.find((p) => p.value === value)?.label || value;
  }

  function formatDate(iso: string) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  }

  function providerIndicatorState(provider: any): "live-ok" | "live-error" | "has-history" | "needs-validation" {
    if (provider.last_validation_at) return provider.last_validation_ok ? "live-ok" : "live-error";
    if (provider.validated_at) return "has-history";
    return "needs-validation";
  }

  function providerValidationLabel(state: "live-ok" | "live-error" | "has-history" | "needs-validation") {
    if (state === "live-ok") return "connected";
    if (state === "live-error") return "failed";
    if (state === "has-history") return "validated";
    return "pending";
  }

  function lastValidationAt(provider: any) {
    return provider.last_validation_at || provider.validated_at || "";
  }

  $effect(() => {
    // Clear probed models when the add form's base_url or api_key changes
    addForm.base_url;
    addForm.api_key;
    addProbedModels = [];
    addProbeError = "";
  });
</script>

<div class="providers-page">
  {#if message}
    <div class="message" class:success={messageTone === "success"} class:error={messageTone === "error"}>{message}</div>
  {/if}

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  <UniversalEntityView
    title="Saved Providers"
    description="Configured model providers with validation history, models, and endpoints."
    records={providerRecords}
    columns={providerColumns}
    views={providerViews}
    defaultViewId="cards"
    {loading}
    actions={providerActions}
    emptyTitle="No saved providers"
    emptyDescription="Add a provider above or install a component to save provider credentials automatically."
    onRefresh={loadProviders}
  >
    {#snippet headerActions()}
      <Button size="sm" onclick={openAdd}>+ Add provider</Button>
    {/snippet}
  </UniversalEntityView>
</div>

<Dialog bind:open={showAddForm} title="Add provider" size="md">
  <div class="field">
    <Label for="add-provider">Provider</Label>
    <Select id="add-provider" bind:value={addForm.provider}>
      {#each PROVIDER_OPTIONS as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </Select>
  </div>
  {#if addForm.provider === OPENAI_COMPATIBLE_VALUE}
    <div class="field">
      <Label for="add-provider-name">Provider Name</Label>
      <Input id="add-provider-name" type="text" bind:value={addForm.provider_name} placeholder="e.g. infini-ai, xiaomi-mimo" />
    </div>
    <div class="field">
      <Label for="add-base-url">Base URL</Label>
      <Input id="add-base-url" type="text" bind:value={addForm.base_url} placeholder="https://api.example.com/v1" />
    </div>
  {/if}
  {#if !isLocal(addForm.provider)}
    <div class="field">
      <Label for="add-api-key">API Key</Label>
      <Input id="add-api-key" type="password" bind:value={addForm.api_key} placeholder="Enter API key..." />
    </div>
  {/if}
  {#if addForm.provider === OPENAI_COMPATIBLE_VALUE}
    <div class="field">
      <Label for="add-model">Model</Label>
      <div class="model-input-row">
        <Input id="add-model" type="text" bind:value={addForm.model} placeholder="e.g. gpt-4" />
        <Button
          variant="outline"
          onclick={fetchAddModels}
          disabled={addProbing || !addForm.base_url.trim()}
          title="Fetch available models from this endpoint"
        >
          {addProbing ? "Fetching..." : "Fetch Models"}
        </Button>
      </div>
      {#if addProbeError}
        <div class="probe-error">{addProbeError}</div>
      {/if}
      {#if addProbedModels.length > 0}
        <div class="model-list">
          {#each addProbedModels as m}
            <Button
              size="sm"
              variant={addForm.model === m ? "default" : "secondary"}
              onclick={() => { addForm.model = m; }}
            >{m}</Button>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <div class="field">
      <Label for="add-model">Model (optional)</Label>
      <Input id="add-model" type="text" bind:value={addForm.model} placeholder="e.g. anthropic/claude-sonnet-4" />
    </div>
  {/if}
  {#if addError}
    <div class="error-message">{addError}</div>
  {/if}
  {#snippet footer()}
    <Button variant="outline" onclick={() => (showAddForm = false)}>Cancel</Button>
    <Button onclick={handleAdd} disabled={addValidating}>
      {addValidating ? "Validating..." : "Save"}
    </Button>
  {/snippet}
</Dialog>

<Dialog
  bind:open={() => !!editingProvider, (v) => { if (!v) cancelEdit(); }}
  title="Edit provider"
  description={editingProvider?.name}
  size="md"
>
  {#if editingProvider}
    <div class="field">
      <Label for="edit-name-{editingProvider.id}">Name</Label>
      <Input id="edit-name-{editingProvider.id}" type="text" bind:value={editForm.name} />
    </div>
    {#if isCustomProvider(editingProvider)}
      <div class="field">
        <Label for="edit-base-url-{editingProvider.id}">Base URL</Label>
        <Input id="edit-base-url-{editingProvider.id}" type="text" bind:value={editForm.base_url} placeholder="https://api.example.com/v1" />
      </div>
    {/if}
    {#if !isLocal(editingProvider.provider)}
      <div class="field">
        <Label for="edit-key-{editingProvider.id}">API Key (leave empty to keep current)</Label>
        <Input id="edit-key-{editingProvider.id}" type="password" bind:value={editForm.api_key} placeholder="Leave empty to keep current" />
      </div>
    {/if}
    <div class="field">
      <Label for="edit-model-{editingProvider.id}">Model</Label>
      {#if isCustomProvider(editingProvider)}
        <div class="model-input-row">
          <Input id="edit-model-{editingProvider.id}" type="text" bind:value={editForm.model} placeholder="e.g. gpt-4" />
          <Button
            variant="outline"
            onclick={fetchEditModels}
            disabled={editProbing || !editForm.base_url.trim()}
            title="Fetch available models from this endpoint"
          >
            {editProbing ? "Fetching..." : "Fetch Models"}
          </Button>
        </div>
        {#if editProbeError}
          <div class="probe-error">{editProbeError}</div>
        {/if}
        {#if editProbedModels.length > 0}
          <div class="model-list">
            {#each editProbedModels as m}
              <Button
                size="sm"
                variant={editForm.model === m ? "default" : "secondary"}
                onclick={() => { editForm.model = m; }}
              >{m}</Button>
            {/each}
          </div>
        {/if}
      {:else}
        <Input id="edit-model-{editingProvider.id}" type="text" bind:value={editForm.model} placeholder="e.g. anthropic/claude-sonnet-4" />
      {/if}
    </div>
    {#if editError}
      <div class="error-message">{editError}</div>
    {/if}
  {/if}
  {#snippet footer()}
    <Button variant="outline" onclick={cancelEdit}>Cancel</Button>
    <Button onclick={() => editingProvider && saveEdit(editingProvider.id)} disabled={editValidating}>
      {editValidating ? "Saving..." : "Save"}
    </Button>
  {/snippet}
</Dialog>

<style>
  .providers-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 0 auto;
    max-width: 1120px;
    padding: 1.5rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .message {
    border-radius: calc(var(--shadcn-radius) - 2px);
    font-size: 0.875rem;
    font-weight: bold;
    padding: 0.875rem 1.25rem;
  }

  .message.success {
    background: color-mix(in srgb, var(--success) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--success) 45%, transparent);
    color: var(--success);
  }

  .message.error {
    background: color-mix(in srgb, var(--shadcn-destructive) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--shadcn-destructive) 45%, transparent);
    color: var(--shadcn-destructive);
  }

  .error-message {
    background: color-mix(in srgb, var(--shadcn-destructive) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--shadcn-destructive) 45%, transparent);
    border-radius: calc(var(--shadcn-radius) - 2px);
    color: var(--shadcn-destructive);
    font-size: 0.875rem;
    padding: 0.875rem 1.25rem;
  }

  .model-input-row {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }

  .model-input-row :global([data-slot="input"]) {
    flex: 1;
  }

  .model-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.5rem;
  }

  .probe-error {
    color: var(--shadcn-destructive);
    margin-top: 0.375rem;
    font-size: 0.75rem;
  }

  @media (max-width: 720px) {
    .providers-page {
      padding: 1rem;
    }

    .model-input-row {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
