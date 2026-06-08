<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { channelSchemas } from "$lib/components/configSchemas";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";

  const DEFAULT_CHANNELS = ['web', 'cli'];
  const CHANNEL_OPTIONS = Object.entries(channelSchemas)
    .filter(([key]) => !DEFAULT_CHANNELS.includes(key))
    .map(([key, schema]) => ({ value: key, label: schema.label }));

  let channels = $state<any[]>([]);
  let loading = $state(false);
  let error = $state("");
  let message = $state("");
  let initialLoadTimer: ReturnType<typeof setTimeout> | null = null;

  // Add form state
  let showAddForm = $state(false);
  let addForm = $state<{ channel_type: string; account: string; config: Record<string, any> }>({
    channel_type: "telegram",
    account: "default",
    config: {},
  });
  let addValidating = $state(false);
  let addError = $state("");

  // Edit state
  let editingId = $state<string | null>(null);
  let editForm = $state<{ name: string; account: string; config: Record<string, any> }>({
    name: "",
    account: "",
    config: {},
  });
  let editOriginalAccount = $state("");
  let editOriginalConfig = $state<Record<string, any>>({});
  let editValidating = $state(false);
  let editError = $state("");
  let editChannelType = $state("");

  // Re-validate state
  let revalidatingId = $state<string | null>(null);

  let hasNullclaw = $state(false);

  let addSchema = $derived(channelSchemas[addForm.channel_type]);
  let editingChannel = $derived(channels.find((channel) => channel.id === editingId) || null);

  const channelColumns: EntityColumn[] = [
    { id: "channel", label: "Channel", type: "select", width: "minmax(150px,.55fr)" },
    { id: "account", label: "Account", type: "mono", width: "minmax(130px,.45fr)" },
    { id: "validation", label: "Validation", type: "status", width: "minmax(130px,.45fr)" },
    { id: "config", label: "Config", type: "text", width: "minmax(260px,1fr)" },
    { id: "validated_at", label: "Validated", type: "date", width: "minmax(150px,.55fr)" },
  ];
  const channelViews = createViewSet({
    kanban: { groupBy: "validation" },
    tree: { parentField: "channel_type" },
    timeline: { dateField: "validated_at" },
    calendar: { dateField: "validated_at" },
  });
  const channelActions: EntityViewAction[] = [
    {
      id: "revalidate",
      label: "Re-validate",
      visible: () => hasNullclaw,
      run: async (record) => {
        if (revalidatingId) return;
        await handleRevalidate(String((record.raw as any)?.id || record.id.replace("channel:", "")));
      },
    },
    { id: "edit", label: "Edit", run: (record) => startEdit(record.raw) },
    {
      id: "delete",
      label: "Delete",
      variant: "destructive",
      run: async (record) => handleDelete(String((record.raw as any)?.id || record.id.replace("channel:", ""))),
    },
  ];
  let channelRecords = $derived(
    channels.map((channel) => {
      const validation = channel.validated_at ? "connected" : "pending";
      const configSummary = Object.entries(channel.config || {})
        .map(([key, value]) => `${key}: ${displayConfigValue(value)}`)
        .join(", ");
      return {
        id: `channel:${channel.id}`,
        title: channel.name,
        type: getChannelLabel(channel.channel_type),
        status: validation,
        subtitle: channel.account || "default",
        description: configSummary || "No config values",
        date: channel.validated_at || "",
        fields: {
          channel: getChannelLabel(channel.channel_type),
          channel_type: channel.channel_type,
          account: channel.account || "default",
          validation,
          config: configSummary || "-",
          validated_at: channel.validated_at || "",
        },
        raw: channel,
      };
    }) satisfies EntityRecord[],
  );

  onMount(() => {
    initialLoadTimer = setTimeout(async () => {
      await loadChannels();
      try {
        const status = await api.getStatus();
        hasNullclaw = Object.keys(status.instances?.nullclaw || {}).length > 0;
      } catch {}
    }, 350);
  });

  onDestroy(() => {
    if (initialLoadTimer) clearTimeout(initialLoadTimer);
  });

  async function loadChannels() {
    loading = true;
    error = "";
    try {
      const data = await api.getSavedChannels();
      channels = data.channels || [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function resetAddConfig(type: string) {
    const schema = channelSchemas[type];
    const defaults: Record<string, any> = {};
    for (const field of schema?.fields || []) {
      if (field.default !== undefined) defaults[field.key] = field.default;
    }
    addForm = {
      channel_type: type,
      account: schema?.hasAccounts ? "default" : type,
      config: defaults,
    };
  }

  function passwordFieldKeys(type: string): string[] {
    return (channelSchemas[type]?.fields || [])
      .filter((field) => field.type === "password")
      .map((field) => field.key);
  }

  function blankPasswordFields(type: string, config: Record<string, any>) {
    const nextConfig = { ...config };
    for (const key of passwordFieldKeys(type)) {
      if (key in nextConfig) nextConfig[key] = "";
    }
    return nextConfig;
  }

  function buildEffectiveEditConfig() {
    const effectiveConfig = { ...editForm.config };
    for (const key of passwordFieldKeys(editChannelType)) {
      const nextValue = effectiveConfig[key];
      if (nextValue === "" || nextValue === undefined || nextValue === null) {
        if (editOriginalConfig[key] !== undefined) {
          effectiveConfig[key] = editOriginalConfig[key];
        } else {
          delete effectiveConfig[key];
        }
      }
    }
    return effectiveConfig;
  }

  async function handleAdd() {
    addValidating = true;
    addError = "";
    try {
      await api.createSavedChannel({
        channel_type: addForm.channel_type,
        account: addForm.account,
        config: addForm.config,
      });
      showAddForm = false;
      resetAddConfig("telegram");
      message = "Channel saved";
      setTimeout(() => (message = ""), 3000);
      await loadChannels();
    } catch (e) {
      addError = (e as Error).message;
    } finally {
      addValidating = false;
    }
  }

  async function startEdit(c: any) {
    editChannelType = c.channel_type;
    editError = "";
    error = "";
    try {
      const data = await api.getSavedChannels(true);
      const revealed = (data.channels || []).find((ch: any) => ch.id === c.id);
      if (revealed) {
        editingId = c.id;
        editOriginalAccount = revealed.account || "";
        editOriginalConfig = { ...(revealed.config || {}) };
        editForm = {
          name: revealed.name || "",
          account: revealed.account || "",
          config: blankPasswordFields(c.channel_type, revealed.config || {}),
        };
      } else {
        error = "Channel could not be loaded for editing";
      }
    } catch (e) {
      const message = (e as Error).message;
      editError = message;
      error = message;
    }
  }

  function cancelEdit() {
    editingId = null;
    editError = "";
  }

  async function saveEdit(id: string) {
    editValidating = true;
    editError = "";
    try {
      const payload: any = {};
      if (editForm.name) payload.name = editForm.name;
      if (editForm.account && editForm.account !== editOriginalAccount) payload.account = editForm.account;
      const effectiveConfig = buildEffectiveEditConfig();
      const configChanged = JSON.stringify(effectiveConfig, Object.keys(effectiveConfig).sort())
        !== JSON.stringify(editOriginalConfig, Object.keys(editOriginalConfig).sort());
      if (configChanged) payload.config = effectiveConfig;
      await api.updateSavedChannel(id, payload);
      editingId = null;
      message = "Channel updated";
      setTimeout(() => (message = ""), 3000);
      await loadChannels();
    } catch (e) {
      editError = (e as Error).message;
    } finally {
      editValidating = false;
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteSavedChannel(id);
      message = "Channel deleted";
      setTimeout(() => (message = ""), 3000);
      await loadChannels();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function handleRevalidate(id: string) {
    revalidatingId = id;
    try {
      const result = await api.revalidateSavedChannel(id);
      if (result.live_ok) {
        message = "Validation passed";
      } else {
        message = `Validation failed: ${result.reason || "unknown error"}`;
      }
      setTimeout(() => (message = ""), 5000);
      await loadChannels();
    } catch (e) {
      message = `Validation failed: ${(e as Error).message}`;
      setTimeout(() => (message = ""), 5000);
    } finally {
      revalidatingId = null;
    }
  }

  function getChannelLabel(type: string) {
    return channelSchemas[type]?.label || type;
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

  function displayConfigValue(val: any): string {
    if (val === undefined || val === null || val === "") return "-";
    if (Array.isArray(val)) return val.length > 0 ? val.join(", ") : "-";
    if (typeof val === "boolean") return val ? "Yes" : "No";
    return String(val);
  }
</script>

{#snippet channelField(prefix: string, field: any, config: Record<string, any>, update: (key: string, value: any) => void)}
  <div class="field">
    <label for={`${prefix}-${field.key}`}>
      {field.label}
      {#if field.hint}
        <span class="field-hint">{field.hint}</span>
      {/if}
    </label>
    {#if field.type === 'password'}
      <input
        id={`${prefix}-${field.key}`}
        type="password"
        value={config[field.key] ?? field.default ?? ""}
        oninput={(e) => update(field.key, e.currentTarget.value)}
        placeholder={prefix.startsWith("edit") ? "Leave empty to keep current" : "Enter value..."}
      />
    {:else if field.type === 'number'}
      <input
        id={`${prefix}-${field.key}`}
        type="number"
        value={config[field.key] ?? field.default ?? ""}
        min={field.min}
        max={field.max}
        step={field.step}
        oninput={(e) => update(field.key, Number(e.currentTarget.value))}
      />
    {:else if field.type === 'toggle'}
      <label class="toggle">
        <input
          type="checkbox"
          checked={(config[field.key] ?? field.default ?? false) === true}
          onchange={(e) => update(field.key, e.currentTarget.checked)}
        />
        <span class="toggle-slider"></span>
      </label>
    {:else if field.type === 'select'}
      <select
        id={`${prefix}-${field.key}`}
        value={config[field.key] ?? field.default ?? ""}
        onchange={(e) => update(field.key, e.currentTarget.value)}
      >
        {#each field.options || [] as opt}
          <option value={opt}>{opt}</option>
        {/each}
      </select>
    {:else if field.type === 'list'}
      <input
        id={`${prefix}-${field.key}`}
        type="text"
        value={(config[field.key] ?? field.default ?? []).join(', ')}
        oninput={(e) => update(field.key, e.currentTarget.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
        placeholder={field.hint || "Comma-separated values..."}
      />
    {:else}
      <input
        id={`${prefix}-${field.key}`}
        type="text"
        value={config[field.key] ?? field.default ?? ""}
        oninput={(e) => update(field.key, e.currentTarget.value)}
        placeholder={field.hint || "Enter value..."}
      />
    {/if}
  </div>
{/snippet}

<div class="channels-page">
  <div class="page-header">
    <h1>Channels</h1>
    {#if hasNullclaw}
      <button class="primary-btn" onclick={() => {
        if (!showAddForm) resetAddConfig(addForm.channel_type || "telegram");
        showAddForm = !showAddForm;
      }}>
        {showAddForm ? "Cancel" : "+ Add Channel"}
      </button>
    {/if}
  </div>

  {#if message}
    <div class="message">{message}</div>
  {/if}

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  {#if !hasNullclaw && channels.length > 0}
    <div class="warning-message">
      Install a nullclaw instance to add new channels or re-validate saved ones.
    </div>
  {/if}

  {#if hasNullclaw && showAddForm}
    <div class="add-form">
      <h2>Add Channel</h2>
      <div class="field">
        <label for="add-channel-type">Channel Type</label>
        <select id="add-channel-type" bind:value={addForm.channel_type} onchange={(e) => resetAddConfig(e.currentTarget.value)}>
          {#each CHANNEL_OPTIONS as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
      {#if addSchema?.hasAccounts}
        <div class="field">
          <label for="add-account">Account Name</label>
          <input id="add-account" type="text" bind:value={addForm.account} placeholder="default" />
        </div>
      {/if}
      {#each (addSchema?.fields || []).filter(f => !f.advanced) as field}
        {@render channelField("add", field, addForm.config, (k, v) => { addForm.config = { ...addForm.config, [k]: v }; })}
      {/each}
      {#if (addSchema?.fields || []).some(f => f.advanced)}
        <details class="advanced-section">
          <summary>Advanced</summary>
          {#each (addSchema?.fields || []).filter(f => f.advanced) as field}
            {@render channelField("add", field, addForm.config, (k, v) => { addForm.config = { ...addForm.config, [k]: v }; })}
          {/each}
        </details>
      {/if}
      {#if addError}
        <div class="error-message">{addError}</div>
      {/if}
      <button class="primary-btn" onclick={handleAdd} disabled={addValidating}>
        {addValidating ? "Validating..." : "Validate & Save"}
      </button>
    </div>
  {/if}

  <UniversalEntityView
    title="Saved Channels"
    description="Configured inbound and outbound channels with account routing and validation state."
    records={channelRecords}
    columns={channelColumns}
    views={channelViews}
    defaultViewId="cards"
    {loading}
    actions={channelActions}
    emptyTitle="No saved channels"
    emptyDescription={hasNullclaw
      ? "Add a channel above or install a component to save channel configuration automatically."
      : "Install a nullclaw instance first to add and validate channels."}
    onRefresh={loadChannels}
  />

  {#if !hasNullclaw && channels.length === 0}
    <a href="/install" class="link-btn">Install NullClaw</a>
  {/if}

  {#if editingChannel}
    {@const editSchema = channelSchemas[editChannelType]}
    <section class="edit-panel">
      <div class="edit-panel-header">
        <div>
          <p>Edit Channel</p>
          <h2>{editingChannel.name}</h2>
        </div>
        <button class="btn" onclick={cancelEdit}>Cancel</button>
      </div>
      <div class="edit-form">
        <div class="field">
          <label for="edit-name-{editingChannel.id}">Name</label>
          <input id="edit-name-{editingChannel.id}" type="text" bind:value={editForm.name} />
        </div>
        {#if editSchema?.hasAccounts}
          <div class="field">
            <label for="edit-account-{editingChannel.id}">Account</label>
            <input id="edit-account-{editingChannel.id}" type="text" bind:value={editForm.account} />
          </div>
        {/if}
        {#each (editSchema?.fields || []).filter(f => !f.advanced) as field}
          {@render channelField(`edit-${editingChannel.id}`, field, editForm.config, (k, v) => { editForm.config = { ...editForm.config, [k]: v }; })}
        {/each}
        {#if (editSchema?.fields || []).some(f => f.advanced)}
          <details class="advanced-section">
            <summary>Advanced</summary>
            {#each (editSchema?.fields || []).filter(f => f.advanced) as field}
              {@render channelField(`edit-${editingChannel.id}`, field, editForm.config, (k, v) => { editForm.config = { ...editForm.config, [k]: v }; })}
            {/each}
          </details>
        {/if}
        {#if editError}
          <div class="error-message">{editError}</div>
        {/if}
        <div class="edit-actions">
          <button class="primary-btn" onclick={() => saveEdit(editingChannel.id)} disabled={editValidating}>
            {editValidating ? "Saving..." : "Save"}
          </button>
          <button class="btn" onclick={cancelEdit}>Cancel</button>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .channels-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 0 auto;
    max-width: 1120px;
    padding: 1.5rem;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  h1 {
    color: var(--shadcn-foreground);
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0;
  }

  h2 {
    color: var(--shadcn-foreground);
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0;
  }

  .add-form,
  .edit-panel {
    background: var(--shadcn-card);
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    color: var(--shadcn-card-foreground);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field label {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0;
  }

  .field input,
  .field select {
    background: var(--shadcn-background);
    border: 1px solid var(--shadcn-input);
    border-radius: calc(var(--shadcn-radius) - 2px);
    color: var(--shadcn-foreground);
    font: inherit;
    min-height: 2.25rem;
    outline: none;
    padding: 0.5rem 0.75rem;
    width: 100%;
  }

  .field input:focus,
  .field select:focus {
    border-color: var(--shadcn-ring);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--shadcn-ring) 18%, transparent);
  }

  .field-hint {
    color: var(--shadcn-muted-foreground);
    font-weight: 400;
    font-size: 0.65rem;
    letter-spacing: 0;
    margin-left: 0.5rem;
  }

  .advanced-section {
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    margin-top: 0.5rem;
    padding: 0 0.75rem;
  }

  .advanced-section[open] {
    padding-bottom: 0.75rem;
  }

  .advanced-section summary {
    color: var(--shadcn-muted-foreground);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.5rem 0;
  }

  .advanced-section summary:hover {
    color: var(--shadcn-foreground);
  }

  .edit-panel-header,
  .edit-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: space-between;
  }

  .edit-panel-header p {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 700;
  }

  .btn {
    align-items: center;
    background: var(--shadcn-secondary);
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    color: var(--shadcn-secondary-foreground);
    cursor: pointer;
    display: inline-flex;
    font-size: 0.75rem;
    font-weight: 600;
    justify-content: center;
    min-height: 2rem;
    padding: 0.375rem 0.75rem;
    transition: background-color 0.15s ease, border-color 0.15s ease;
    white-space: nowrap;
  }

  .btn:hover:not(:disabled) {
    background: var(--shadcn-accent);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .primary-btn {
    align-items: center;
    background: var(--shadcn-primary) !important;
    border: 1px solid var(--shadcn-primary);
    border-radius: calc(var(--shadcn-radius) - 2px);
    color: var(--shadcn-primary-foreground, #fff) !important;
    cursor: pointer;
    display: inline-flex;
    font-size: 0.875rem;
    font-weight: 600;
    justify-content: center;
    min-height: 2.25rem;
    padding: 0.5rem 1rem;
    white-space: nowrap;
  }

  .primary-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--shadcn-primary) 88%, var(--shadcn-background));
  }

  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .message {
    background: color-mix(in srgb, var(--success) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--success) 45%, transparent);
    border-radius: calc(var(--shadcn-radius) - 2px);
    font-size: 0.875rem;
    font-weight: bold;
    color: var(--success);
    padding: 0.875rem 1.25rem;
  }

  .warning-message {
    background: color-mix(in srgb, var(--warning, #ca0) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--warning, #ca0) 45%, transparent);
    border-radius: calc(var(--shadcn-radius) - 2px);
    font-size: 0.875rem;
    color: var(--warning, #ca0);
    padding: 0.875rem 1.25rem;
  }

  .error-message {
    background: color-mix(in srgb, var(--shadcn-destructive) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--shadcn-destructive) 45%, transparent);
    border-radius: calc(var(--shadcn-radius) - 2px);
    font-size: 0.875rem;
    color: var(--shadcn-destructive);
    padding: 0.875rem 1.25rem;
  }

  .link-btn {
    align-self: flex-start;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    font-weight: 600;
    padding: 0.5rem 1rem;
    text-decoration: none;
  }

  .link-btn:hover {
    background: var(--shadcn-accent);
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .toggle {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    cursor: pointer;
  }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--shadcn-secondary);
    border: 1px solid var(--shadcn-border);
    border-radius: 999px;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .toggle-slider::before {
    background: var(--shadcn-muted-foreground);
    border-radius: 999px;
    content: "";
    height: 16px;
    left: 4px;
    position: absolute;
    top: 3px;
    transition: background-color 0.15s ease, transform 0.15s ease;
    width: 16px;
  }

  .toggle input:checked + .toggle-slider {
    background: var(--shadcn-primary);
    border-color: var(--shadcn-primary);
  }

  .toggle input:checked + .toggle-slider::before {
    background: var(--shadcn-primary-foreground);
    transform: translateX(18px);
  }

  @media (max-width: 720px) {
    .channels-page {
      padding: 1rem;
    }

    .page-header,
    .edit-panel-header,
    .edit-actions {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
