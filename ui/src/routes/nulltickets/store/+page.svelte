<script lang="ts">
  import { nullTicketsStoreApi } from "$lib/api/client";
  import { getSelectedTicketsInstance } from "$lib/nullstack/backendSelection";
  import TicketsInstanceSelector from "$lib/components/nulltickets/TicketsInstanceSelector.svelte";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";

  let namespace = $state("");
  let browsedNamespace = $state("");
  let entries = $state<any[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  let selectedEntry = $state<{ key: string; value: any } | null>(null);

  let addNamespace = $state("");
  let addKey = $state("");
  let addValue = $state("");
  let addError = $state<string | null>(null);
  let addSuccess = $state(false);
  let addLoading = $state(false);

  const entryColumns: EntityColumn[] = [
    { id: "namespace", label: "Namespace", type: "mono", width: "minmax(140px,.5fr)" },
    { id: "key", label: "Key", type: "mono", width: "minmax(180px,.8fr)" },
    { id: "value_kind", label: "Value", type: "select", width: "minmax(110px,.36fr)" },
    { id: "value_preview", label: "Preview", type: "text", width: "minmax(260px,1.2fr)" },
  ];
  const entryViews = createViewSet({
    kanban: { groupBy: "value_kind" },
    tree: { parentField: "namespace" },
    timeline: { dateField: "updated" },
    calendar: { dateField: "updated" },
  });
  const entryActions: EntityViewAction[] = [
    { id: "view", label: "View", variant: "default", run: (record) => viewEntry(record.raw) },
    { id: "delete", label: "Delete", variant: "destructive", run: (record) => deleteEntry(String(record.fields?.key || record.title)) },
  ];

  const entryRecords = $derived(
    entries.map((entry) => {
      const key = entryKey(entry);
      const value = entry?.value !== undefined ? entry.value : entry;
      return {
        id: `store:${browsedNamespace}:${key}`,
        title: key,
        type: "store entry",
        subtitle: browsedNamespace,
        description: previewValue(value),
        fields: {
          namespace: browsedNamespace,
          key,
          value_kind: valueKind(value),
          value_preview: previewValue(value),
          updated: entry?.updated_at || entry?.created_at || "",
        },
        raw: entry,
      };
    }) satisfies EntityRecord[],
  );

  function ticketsTarget(): string | undefined {
    return getSelectedTicketsInstance() || undefined;
  }

  function handleTicketsInstanceChange() {
    error = null;
    selectedEntry = null;
    addError = null;
    addSuccess = false;
    if (browsedNamespace) void loadEntries(browsedNamespace);
  }

  async function loadEntries(targetNamespace: string) {
    const trimmedNamespace = targetNamespace.trim();
    if (!trimmedNamespace) return;
    browsedNamespace = trimmedNamespace;
    loading = true;
    error = null;
    entries = [];
    selectedEntry = null;
    try {
      entries = (await nullTicketsStoreApi.storeList(browsedNamespace, ticketsTarget())) || [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function browse() {
    await loadEntries(namespace);
  }

  function entryKey(entry: any): string {
    return typeof entry === "string" ? entry : String(entry?.key ?? entry);
  }

  async function deleteEntry(key: string) {
    if (!confirm(`Delete key "${key}" from namespace "${browsedNamespace}"?`)) return;
    try {
      await nullTicketsStoreApi.storeDelete(browsedNamespace, key, ticketsTarget());
      entries = entries.filter((entry) => entryKey(entry) !== key);
      if (selectedEntry?.key === key) selectedEntry = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function viewEntry(entry: any) {
    const key = entryKey(entry);
    try {
      const full = await nullTicketsStoreApi.storeGet(browsedNamespace, key, ticketsTarget());
      selectedEntry = { key, value: full?.value ?? full };
    } catch {
      selectedEntry = { key, value: entry?.value ?? entry };
    }
  }

  async function saveEntry() {
    addError = null;
    addSuccess = false;
    if (!addNamespace.trim() || !addKey.trim() || !addValue.trim()) {
      addError = "All fields are required.";
      return;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(addValue);
    } catch {
      addError = "Value must be valid JSON.";
      return;
    }
    addLoading = true;
    try {
      await nullTicketsStoreApi.storePut(addNamespace.trim(), addKey.trim(), parsed, ticketsTarget());
      addSuccess = true;
      addKey = "";
      addValue = "";
      if (browsedNamespace === addNamespace.trim()) await loadEntries(browsedNamespace);
    } catch (e) {
      addError = (e as Error).message;
    } finally {
      addLoading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) browse();
  }

  function closeModal() {
    selectedEntry = null;
  }

  function previewValue(value: any): string {
    const text = formatValue(value).replace(/\s+/g, " ").trim();
    return text.length > 140 ? `${text.slice(0, 140)}...` : text || "-";
  }

  function valueKind(value: any): string {
    if (Array.isArray(value)) return "array";
    if (value === null) return "null";
    return typeof value;
  }

  function formatValue(value: any): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
</script>

<div class="page">
  <aside class="control-panel">
    <section class="panel-section">
      <h2>Browse Namespace</h2>
      <TicketsInstanceSelector label="Store backend" onChange={handleTicketsInstanceChange} />
      <div class="input-row">
        <input
          type="text"
          placeholder="namespace"
          bind:value={namespace}
          onkeydown={handleKeydown}
        />
        <button type="button" class="primary-button" onclick={browse} disabled={loading || !namespace.trim()}>
          {loading ? "Loading" : "Browse"}
        </button>
      </div>
    </section>

    <section class="panel-section add-section">
      <h2>Add Entry</h2>
      <label>
        <span>Namespace</span>
        <input type="text" placeholder="namespace" bind:value={addNamespace} />
      </label>
      <label>
        <span>Key</span>
        <input type="text" placeholder="key" bind:value={addKey} />
      </label>
      <label>
        <span>Value (JSON)</span>
        <textarea placeholder="JSON value" bind:value={addValue} rows={5}></textarea>
      </label>
      {#if addError}<div class="form-message error">{addError}</div>{/if}
      {#if addSuccess}<div class="form-message success">Saved.</div>{/if}
      <button type="button" class="primary-button" onclick={saveEntry} disabled={addLoading}>
        {addLoading ? "Saving" : "Save"}
      </button>
    </section>
  </aside>

  <main class="content">
    {#if !browsedNamespace}
      <div class="empty-state">
        <strong>Browse a namespace</strong>
        <span>Enter a namespace to load store entries.</span>
      </div>
    {:else}
      <UniversalEntityView
        title={`/${browsedNamespace}`}
        description="Key/value entries from the selected NullTickets store namespace."
        records={entryRecords}
        columns={entryColumns}
        views={entryViews}
        defaultViewId="split"
        {loading}
        {error}
        actions={entryActions}
        emptyTitle="No entries"
        emptyDescription="This namespace does not contain any entries."
        onRefresh={() => loadEntries(browsedNamespace)}
        onOpen={(record) => void viewEntry(record.raw)}
      />
    {/if}
  </main>
</div>

{#if selectedEntry}
  <div class="modal-backdrop">
    <button type="button" class="modal-backdrop-button" aria-label="Close dialog" onclick={closeModal}></button>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Entry detail" tabindex="-1" onkeydown={(e) => { if (e.key === "Escape") closeModal(); }}>
      <div class="modal-header">
        <span class="modal-title mono">{selectedEntry.key}</span>
        <button type="button" class="modal-close" onclick={closeModal} aria-label="Close">Close</button>
      </div>
      <div class="modal-body">
        <pre class="json-view">{formatValue(selectedEntry.value)}</pre>
      </div>
    </div>
  </div>
{/if}

<style>
  .page {
    display: grid;
    grid-template-columns: minmax(240px, 18rem) minmax(0, 1fr);
    gap: 1rem;
    min-width: 0;
    align-items: start;
  }

  .control-panel {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .panel-section {
    display: grid;
    gap: 0.75rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 1rem;
    background: var(--shadcn-card);
    color: var(--shadcn-card-foreground);
  }

  .panel-section h2 {
    margin: 0;
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    font-weight: 650;
  }

  .input-row {
    display: flex;
    gap: 0.5rem;
    min-width: 0;
  }

  label {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  label span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 600;
  }

  input,
  textarea {
    min-width: 0;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0.5rem 0.625rem;
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    font: inherit;
    font-size: 0.875rem;
  }

  textarea {
    resize: vertical;
  }

  .primary-button {
    min-height: 2.25rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0 0.875rem;
    background: var(--shadcn-primary);
    color: var(--shadcn-primary-foreground);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .primary-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .form-message {
    border-radius: var(--shadcn-radius);
    padding: 0.5rem 0.625rem;
    font-size: 0.8125rem;
  }

  .form-message.error {
    border: 1px solid var(--shadcn-destructive);
    color: var(--shadcn-destructive);
  }

  .form-message.success {
    border: 1px solid var(--shadcn-border);
    color: var(--shadcn-foreground);
    background: var(--shadcn-muted);
  }

  .content {
    min-width: 0;
  }

  .empty-state {
    display: grid;
    min-height: 20rem;
    place-content: center;
    gap: 0.35rem;
    border: 1px dashed var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
    color: var(--shadcn-muted-foreground);
    text-align: center;
  }

  .empty-state strong {
    color: var(--shadcn-foreground);
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-backdrop-button {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgb(0 0 0 / 0.62);
    cursor: pointer;
  }

  .modal {
    position: relative;
    display: flex;
    width: min(720px, 92vw);
    max-height: 82vh;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
    box-shadow: 0 18px 54px rgb(0 0 0 / 0.28);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid var(--shadcn-border);
    padding: 0.875rem 1rem;
  }

  .modal-title {
    min-width: 0;
    overflow: hidden;
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .modal-close {
    min-height: 2rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0 0.75rem;
    background: var(--shadcn-secondary);
    color: var(--shadcn-secondary-foreground);
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .modal-body {
    flex: 1;
    overflow: auto;
    padding: 1rem;
  }

  .json-view {
    margin: 0;
    color: var(--shadcn-foreground);
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .mono {
    font-family: var(--font-mono);
  }

  @media (max-width: 820px) {
    .page {
      grid-template-columns: 1fr;
    }
  }
</style>
