<script lang="ts">
  import {
    deleteMarkdownDocument,
    getMarkdownDocument,
    isValidMarkdownPath,
    listMarkdownDocuments,
    markdownDocumentKey,
    normalizeMarkdownPath,
    saveMarkdownDocument,
    type MarkdownDocument,
    type MarkdownDocumentEntry,
  } from '$lib/api/markdownDocuments';

  let {
    component,
    name,
    active,
    onExit,
  } = $props<{
    component: string;
    name: string;
    active: boolean;
    onExit?: () => void;
  }>();

  let documents = $state<MarkdownDocumentEntry[]>([]);
  let selectedKey = $state('');
  let draftTitle = $state('');
  let draftPath = $state('');
  let draftTags = $state('');
  let draftContent = $state('');
  let draftArtifactId = $state<string | null>(null);
  let lastSavedSnapshot = $state('');
  let saving = $state(false);
  let deleting = $state(false);
  let error = $state('');
  let message = $state('');
  let loadKey = $state('');
  let deleteConfirmKey = $state('');

  const normalizedDraftPath = $derived(normalizeMarkdownPath(draftPath));
  const draftTagsList = $derived(parseTags(draftTags));
  const draftSnapshot = $derived(JSON.stringify({
    title: draftTitle,
    path: normalizedDraftPath,
    tags: draftTagsList,
    content: draftContent,
    artifact_id: draftArtifactId,
  }));
  const dirty = $derived(draftSnapshot !== lastSavedSnapshot);
  const pathValid = $derived(isValidMarkdownPath(draftPath));
  const canSave = $derived(pathValid && draftContent.length <= 512 * 1024 && !saving);
  const storeTicketsInstance = $derived(component === 'nulltickets' ? name : '');
  const softStoreError = $derived(error.trim().toLowerCase() === 'not found');

  function parseTags(value: string): string[] {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function documentSnapshot(document: MarkdownDocument): string {
    return JSON.stringify({
      title: document.title,
      path: normalizeMarkdownPath(document.path),
      tags: document.tags || [],
      content: document.content || '',
      artifact_id: document.artifact_id || null,
    });
  }

  function documentKeyExists(path: string, ignoredKey = ''): boolean {
    const key = markdownDocumentKey(component, name, path);
    return documents.some((entry) => entry.key === key && entry.key !== ignoredKey);
  }

  function uniqueMarkdownPath(basePath: string): string {
    const base = normalizeMarkdownPath(basePath) || 'docs/new-document.md';
    const dot = base.lastIndexOf('.');
    const stem = dot >= 0 ? base.slice(0, dot) : base;
    const ext = dot >= 0 ? base.slice(dot) : '.md';
    let candidate = base;
    let suffix = 2;
    while (documentKeyExists(candidate)) {
      candidate = `${stem}-${suffix}${ext}`;
      suffix += 1;
    }
    return candidate;
  }

  function emptySnapshot(): string {
    return JSON.stringify({
      title: '',
      path: '',
      tags: [],
      content: '',
      artifact_id: null,
    });
  }

  function loadDraft(entry: MarkdownDocumentEntry | null) {
    if (!entry) {
      draftTitle = '';
      draftPath = '';
      draftTags = '';
      draftContent = '';
      draftArtifactId = null;
      lastSavedSnapshot = emptySnapshot();
      selectedKey = '';
      deleteConfirmKey = '';
      return;
    }
    selectedKey = entry.key;
    draftTitle = entry.document.title;
    draftPath = entry.document.path;
    draftTags = (entry.document.tags || []).join(', ');
    draftContent = entry.document.content || '';
    draftArtifactId = entry.document.artifact_id || null;
    lastSavedSnapshot = entry.key ? documentSnapshot(entry.document) : '';
    deleteConfirmKey = '';
  }

  async function refresh() {
    error = '';
    message = '';
    try {
      documents = await listMarkdownDocuments(component, name, storeTicketsInstance);
      if (selectedKey) {
        const next = documents.find((entry) => entry.key === selectedKey) || null;
        if (next && !dirty) loadDraft(next);
        else if (!next && !dirty) loadDraft(documents[0] || null);
      } else if (documents.length > 0 && !dirty) {
        loadDraft(documents[0]);
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function selectDocument(key: string) {
    if (dirty && !confirm('Discard unsaved Markdown changes?')) return;
    error = '';
    message = '';
    try {
      const entry = await getMarkdownDocument(key, component, name, storeTicketsInstance);
      loadDraft(entry);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function newDocument() {
    if (dirty && !confirm('Discard unsaved Markdown changes?')) return;
    const nextPath = uniqueMarkdownPath(`docs/new-document-${new Date().toISOString().slice(0, 10)}.md`);
    const document: MarkdownDocument = {
      schema_version: 1,
      title: 'New Document',
      path: nextPath,
      content: '# New Document\n\n',
      tags: [],
      owner_component: component,
      owner_instance: name,
      source: 'store',
      created_at_ms: Date.now(),
      updated_at_ms: Date.now(),
      artifact_id: null,
    };
    loadDraft({ key: '', document, created_at_ms: null, updated_at_ms: null });
  }

  async function saveDraft(): Promise<boolean> {
    if (!canSave) return false;
    if (documentKeyExists(normalizedDraftPath, selectedKey)) {
      error = 'A Markdown document already exists at this path.';
      message = '';
      return false;
    }
    saving = true;
    error = '';
    message = '';
    try {
      const saved = await saveMarkdownDocument(
        component,
        name,
        {
          title: draftTitle,
          path: draftPath,
          content: draftContent,
          tags: draftTagsList,
          artifact_id: draftArtifactId,
        },
        selectedKey || undefined,
        storeTicketsInstance,
      );
      selectedKey = saved.key;
      lastSavedSnapshot = documentSnapshot(saved.document);
      message = 'Document saved.';
      await refresh();
      const next = documents.find((entry) => entry.key === saved.key) || saved;
      loadDraft(next);
      return true;
    } catch (e) {
      error = (e as Error).message;
      return false;
    } finally {
      saving = false;
    }
  }

  async function removeDraft() {
    if (!selectedKey || deleteConfirmKey !== selectedKey) {
      deleteConfirmKey = selectedKey;
      message = 'Press Delete again to confirm.';
      return;
    }
    deleting = true;
    error = '';
    message = '';
    try {
      await deleteMarkdownDocument(selectedKey, storeTicketsInstance);
      documents = documents.filter((entry) => entry.key !== selectedKey);
      loadDraft(documents[0] || null);
      message = 'Document deleted.';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      deleting = false;
      deleteConfirmKey = '';
    }
  }

  function handleEditorKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveDraft();
    }
  }

  $effect(() => {
    const key = `${component}/${name}/${active}`;
    if (!active || loadKey === key) return;
    loadKey = key;
    loadDraft(null);
    void refresh();
  });
</script>

<div class="markdown-manager">
  {#if error && !softStoreError}
    <div class="error-banner">{error}</div>
  {/if}
  {#if message}
    <div class="message-banner">{message}</div>
  {/if}

  <section class="editor-shell" aria-label="Markdown editor">
    <div class="fields-row">
      <input aria-label="Title" bind:value={draftTitle} placeholder="Title" />
      <input aria-label="Path" class:invalid={!pathValid && draftPath.trim()} bind:value={draftPath} placeholder="docs/runbook.md" />
      <button class="btn" onclick={newDocument}>New</button>
      <button class="btn danger" onclick={removeDraft} disabled={!selectedKey || deleting}>
        {selectedKey && deleteConfirmKey === selectedKey ? 'Confirm' : 'Delete'}
      </button>
      <button class="btn primary" onclick={saveDraft} disabled={!canSave}>{saving ? 'Saving' : 'Save'}</button>
      {#if onExit}
        <button class="btn" onclick={onExit}>Back</button>
      {/if}
    </div>

    <textarea aria-label="Markdown" bind:value={draftContent} onkeydown={handleEditorKeydown} spellcheck="false"></textarea>
  </section>
  {#if documents.length > 0}
    <section class="document-strip" aria-label="Markdown documents">
      <div class="doc-scroll">
        {#each documents as entry}
          <button class="doc-row" class:active={entry.key === selectedKey} onclick={() => selectDocument(entry.key)}>
            <span class="doc-title">{entry.document.title}</span>
            <span class="doc-path">{entry.document.path}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .markdown-manager {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 6px;
    width: 100%;
    max-width: 1360px;
    height: 100%;
    margin: 0 auto;
    padding: 6px 10px 8px;
    overflow: hidden;
  }

  button {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    min-width: 54px;
    min-height: 26px;
    padding: 0 8px;
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  button.active,
  .btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--bg);
  }

  .btn.primary:disabled {
    border-color: var(--border);
    background: var(--bg-hover);
    color: var(--fg-dim);
  }

  .btn.danger {
    border-color: var(--error);
    color: var(--error);
  }

  input,
  textarea {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    padding: 5px 8px;
    font: inherit;
  }

  input.invalid {
    border-color: var(--error);
  }

  textarea {
    min-height: 0;
    height: 100%;
    padding: 12px;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    line-height: 1.5;
  }

  .error-banner,
  .message-banner {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 20;
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 12px;
  }

  .error-banner {
    border: 1px solid color-mix(in srgb, var(--error), transparent 68%);
    color: var(--error);
  }

  .message-banner {
    border: 1px solid var(--success);
    color: var(--success);
  }

  .document-strip,
  .editor-shell {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-elevated);
  }

  .document-strip,
  .editor-shell {
    padding: 5px 6px;
  }

  .editor-shell {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .document-strip {
    min-height: 36px;
    display: flex;
    align-items: center;
  }

  .doc-scroll {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    width: 100%;
  }

  .doc-row {
    display: grid;
    gap: 2px;
    min-width: 220px;
    max-width: 320px;
    text-align: left;
    padding: 7px 8px;
  }

  .doc-title {
    font-weight: 700;
  }

  .doc-path {
    color: var(--fg-dim);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 12px;
  }

  .fields-row {
    display: grid;
    grid-template-columns: minmax(160px, 1fr) minmax(220px, 2fr) auto auto auto auto;
    gap: 5px;
    margin-bottom: 5px;
  }

  @media (max-width: 920px) {
    .fields-row {
      grid-template-columns: 1fr;
    }

    textarea {
      min-height: 0;
    }
  }
</style>
