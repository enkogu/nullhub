<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { channelSchemas } from './configSchemas';
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Select } from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
  import { Card } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  let {
    value = {} as Record<string, Record<string, Record<string, any>>>,
    onchange = (v: Record<string, Record<string, Record<string, any>>>) => {},
    validationResults = [] as Array<{ channel: string; account: string; live_ok: boolean; reason: string }>,
  } = $props();

  const DEFAULT_CHANNELS = ['web', 'cli'];

  let addedChannels = $state<Array<{ type: string; account: string }>>([]);
  let showAddPicker = $state(false);
  let savedChannels = $state<any[]>([]);
  let showSavedDropdown = $state(false);
  let savedChannelsRevealed = $state(false);
  let loadingSavedChannels = $state(false);

  function sameEntries(
    a: Array<{ type: string; account: string }>,
    b: Array<{ type: string; account: string }>,
  ) {
    return (
      a.length === b.length &&
      a.every((entry, idx) => entry.type === b[idx]?.type && entry.account === b[idx]?.account)
    );
  }

  onMount(async () => {
    try {
      const data = await api.getSavedChannels();
      savedChannels = data.channels || [];
    } catch {}
  });

  $effect(() => {
    const entries: Array<{ type: string; account: string }> = [];
    for (const [type, accounts] of Object.entries(value)) {
      if (DEFAULT_CHANNELS.includes(type)) continue;
      for (const account of Object.keys(accounts)) {
        entries.push({ type, account });
      }
    }
    if (!sameEntries(entries, addedChannels)) {
      addedChannels = entries;
    }
  });

  let availableChannelTypes = $derived(
    Object.entries(channelSchemas)
      .filter(([key]) => !DEFAULT_CHANNELS.includes(key))
      .map(([key, schema]) => ({ key, label: schema.label }))
  );

  function addChannel(type: string) {
    const schema = channelSchemas[type];
    const account = schema?.hasAccounts ? 'default' : type;
    const newValue = { ...value };
    if (!newValue[type]) newValue[type] = {};
    if (newValue[type][account]) {
      showAddPicker = false;
      return;
    }
    const defaults: Record<string, any> = {};
    for (const field of schema?.fields || []) {
      if (field.default !== undefined) defaults[field.key] = field.default;
    }
    newValue[type][account] = defaults;
    onchange(newValue);
    showAddPicker = false;
  }

  function removeChannel(index: number) {
    const entry = addedChannels[index];
    addedChannels = addedChannels.filter((_, i) => i !== index);
    const newValue = { ...value };
    if (newValue[entry.type]?.[entry.account]) {
      delete newValue[entry.type][entry.account];
      if (Object.keys(newValue[entry.type]).length === 0) {
        delete newValue[entry.type];
      }
    }
    onchange(newValue);
  }

  function updateField(type: string, account: string, key: string, val: any) {
    const newValue = { ...value };
    if (!newValue[type]) newValue[type] = {};
    if (!newValue[type][account]) newValue[type][account] = {};
    newValue[type][account] = { ...newValue[type][account], [key]: val };
    onchange(newValue);
  }

  function getFieldValue(type: string, account: string, key: string, def: any): any {
    return value[type]?.[account]?.[key] ?? def ?? '';
  }

  function getValidationResult(type: string, account: string) {
    return validationResults.find((r: any) => r.channel === type && r.account === account);
  }

  function isNamedAccount(account: string) {
    return account.length > 0 && account !== 'default';
  }

  async function toggleSavedDropdown() {
    if (showSavedDropdown) {
      showSavedDropdown = false;
      return;
    }
    if (!savedChannelsRevealed && savedChannels.length > 0) {
      loadingSavedChannels = true;
      try {
        const data = await api.getSavedChannels(true);
        savedChannels = data.channels || [];
        savedChannelsRevealed = true;
      } catch {
        loadingSavedChannels = false;
        return;
      }
      loadingSavedChannels = false;
    }
    showSavedDropdown = true;
  }

  function useSaved(sc: any) {
    const type = sc.channel_type;
    const account = sc.account;
    const newValue = { ...value };
    if (!newValue[type]) newValue[type] = {};
    newValue[type][account] = { ...sc.config };
    onchange(newValue);
    showSavedDropdown = false;
  }
</script>

{#snippet channelField(entry: { type: string; account: string }, field: any)}
  <div class="channel-field">
    <Label for={`ch-${entry.type}-${entry.account}-${field.key}`}>
      {field.label}
      {#if field.hint}
        <span class="field-hint">{field.hint}</span>
      {/if}
    </Label>

    {#if field.type === 'password'}
      <Input
        id={`ch-${entry.type}-${entry.account}-${field.key}`}
        type="password"
        value={getFieldValue(entry.type, entry.account, field.key, field.default)}
        oninput={(e) => updateField(entry.type, entry.account, field.key, e.currentTarget.value)}
        placeholder="Enter value..."
      />
    {:else if field.type === 'number'}
      <Input
        id={`ch-${entry.type}-${entry.account}-${field.key}`}
        type="number"
        value={getFieldValue(entry.type, entry.account, field.key, field.default)}
        oninput={(e) => updateField(entry.type, entry.account, field.key, Number(e.currentTarget.value))}
      />
    {:else if field.type === 'toggle'}
      <label class="toggle">
        <input
          type="checkbox"
          checked={getFieldValue(entry.type, entry.account, field.key, field.default) === true}
          onchange={(e) => updateField(entry.type, entry.account, field.key, e.currentTarget.checked)}
        />
        <span class="toggle-slider"></span>
      </label>
    {:else if field.type === 'select'}
      <Select
        id={`ch-${entry.type}-${entry.account}-${field.key}`}
        value={getFieldValue(entry.type, entry.account, field.key, field.default)}
        onchange={(e) => updateField(entry.type, entry.account, field.key, e.currentTarget.value)}
      >
        {#each field.options || [] as opt}
          <option value={opt}>{opt}</option>
        {/each}
      </Select>
    {:else if field.type === 'list'}
      <Input
        id={`ch-${entry.type}-${entry.account}-${field.key}`}
        type="text"
        value={(getFieldValue(entry.type, entry.account, field.key, field.default) || []).join(', ')}
        oninput={(e) => updateField(entry.type, entry.account, field.key, e.currentTarget.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
        placeholder={field.hint || "Comma-separated values..."}
      />
    {:else}
      <Input
        id={`ch-${entry.type}-${entry.account}-${field.key}`}
        type="text"
        value={getFieldValue(entry.type, entry.account, field.key, field.default)}
        oninput={(e) => updateField(entry.type, entry.account, field.key, e.currentTarget.value)}
        placeholder={field.hint || "Enter value..."}
      />
    {/if}
  </div>
{/snippet}

<div class="channel-list">
  <div class="step-title">Channels</div>
  <p class="step-description">
    Where would you like to talk to your bot? Web and CLI are available by default.
  </p>

  {#each DEFAULT_CHANNELS as ch}
    <div class="channel-default">
      <label class="toggle-row">
        <input type="checkbox" checked disabled />
        <span class="channel-label">{channelSchemas[ch]?.label || ch.toUpperCase()}</span>
        <Badge variant="muted">Default</Badge>
      </label>
    </div>
  {/each}

  {#each addedChannels as entry, i}
    {@const schema = channelSchemas[entry.type]}
    {@const result = getValidationResult(entry.type, entry.account)}
    <Card class="channel-row px-5">
      <div class="channel-row-header">
        <span class="channel-name">{schema?.label || entry.type}</span>
        {#if schema?.hasAccounts && isNamedAccount(entry.account)}
          <span class="account-name">{entry.account}</span>
        {/if}
        {#if result}
          <Badge variant={result.live_ok ? "success" : "destructive"} title={result.reason}>
            {result.live_ok ? "Connected" : "Failed"}
          </Badge>
        {/if}
        <Button
          variant="ghost"
          size="icon-sm"
          class="danger-icon remove-btn"
          onclick={() => removeChannel(i)}
          aria-label="Remove channel"
          title="Remove"
        >
          <Trash2Icon />
        </Button>
      </div>

      <div class="channel-fields">
        {#each (schema?.fields || []).filter((field) => !field.advanced) as field}
          {@render channelField(entry, field)}
        {/each}
        {#if (schema?.fields || []).some((field) => field.advanced)}
          <details class="advanced-section">
            <summary>Advanced</summary>
            <div class="advanced-fields">
              {#each (schema?.fields || []).filter((field) => field.advanced) as field}
                {@render channelField(entry, field)}
              {/each}
            </div>
          </details>
        {/if}
      </div>
    </Card>
  {/each}

  {#if showAddPicker}
    <Card class="add-picker px-5">
      {#each availableChannelTypes as ct}
        <Button variant="outline" size="sm" onclick={() => addChannel(ct.key)}>
          {ct.label}
        </Button>
      {/each}
      <Button variant="ghost" size="sm" onclick={() => (showAddPicker = false)}>Cancel</Button>
    </Card>
  {:else}
    <div class="add-row">
      <Button variant="outline" class="add-btn" onclick={() => (showAddPicker = true)}>
        <PlusIcon />
        Add channel
      </Button>
      {#if savedChannels.length > 0}
        <div class="saved-dropdown-container">
          <Button variant="secondary" onclick={toggleSavedDropdown} disabled={loadingSavedChannels}>
            {loadingSavedChannels ? "Loading..." : showSavedDropdown ? "Close" : "Use saved"}
          </Button>
          {#if showSavedDropdown}
            <div class="saved-dropdown">
              {#each savedChannels as sc}
                <button class="saved-item" onclick={() => useSaved(sc)}>
                  <span class="saved-name">{sc.name}</span>
                  <span class="saved-type">
                    {channelSchemas[sc.channel_type]?.label || sc.channel_type}
                    {#if isNamedAccount(sc.account)}
                      / {sc.account}
                    {/if}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .channel-list { margin-bottom: 2rem; }

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

  .channel-default {
    padding: 0.75rem 1rem;
    margin-bottom: 0.5rem;
    background: var(--shadcn-card);
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    display: flex;
    align-items: center;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: default;
  }

  .toggle-row input[type="checkbox"] { accent-color: var(--shadcn-primary); }

  .channel-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--shadcn-foreground);
  }

  :global(.channel-row.channel-row) {
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .channel-row-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .channel-name {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--shadcn-foreground);
    flex: 1;
  }

  .account-name {
    font-size: 0.75rem;
    color: var(--shadcn-muted-foreground);
    font-family: var(--prin7r-font-mono-standard);
  }

  .channel-fields { display: flex; flex-direction: column; gap: 0.75rem; }

  .advanced-section {
    margin-top: 0.25rem;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    padding: 0 0.75rem;
  }

  .advanced-section[open] {
    padding-bottom: 0.75rem;
  }

  .advanced-section summary {
    cursor: pointer;
    padding: 0.6rem 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--shadcn-muted-foreground);
  }

  .advanced-section summary:hover {
    color: var(--shadcn-foreground);
  }

  .advanced-fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .channel-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .field-hint {
    font-weight: 400;
    font-size: 0.65rem;
    color: var(--shadcn-muted-foreground);
    margin-left: 0.5rem;
  }

  :global(.danger-icon) {
    color: var(--shadcn-destructive);
  }
  :global(.danger-icon:hover) {
    color: var(--shadcn-destructive);
  }

  :global(.add-picker) {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5rem;
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
    content: "";
    position: absolute;
    width: 16px;
    height: 16px;
    left: 4px;
    top: 3px;
    background: var(--shadcn-muted-foreground);
    border-radius: 999px;
    transition: background-color 0.15s ease, transform 0.15s ease;
  }
  .toggle input:checked + .toggle-slider {
    background: var(--shadcn-primary);
    border-color: var(--shadcn-primary);
  }
  .toggle input:checked + .toggle-slider::before {
    transform: translateX(18px);
    background: var(--shadcn-primary-foreground);
  }

  .saved-dropdown {
    position: absolute;
    bottom: 100%;
    right: 0;
    min-width: 220px;
    background: var(--shadcn-card);
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    margin-bottom: 0.25rem;
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
    transition: background-color 0.15s ease, color 0.15s ease;
    text-align: left;
  }
  .saved-item:last-child { border-bottom: none; }
  .saved-item:hover {
    background: var(--shadcn-accent);
  }
  .saved-name {
    font-size: 0.875rem;
    font-weight: 600;
  }
  .saved-type {
    font-size: 0.75rem;
    color: var(--shadcn-muted-foreground);
    margin-top: 0.125rem;
  }
</style>
