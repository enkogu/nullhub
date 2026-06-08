<script lang="ts">
  import { onDestroy } from 'svelte';
  import { marked } from 'marked';
  import {
    deleteMarkdownDocument,
    getMarkdownDocument,
    isValidMarkdownPath,
    listMarkdownDocuments,
    normalizeMarkdownPath,
    saveMarkdownDocument,
    type MarkdownDocument,
    type MarkdownDocumentEntry,
  } from '$lib/api/markdownDocuments';
  import { headerToolbar } from '$lib/headerToolbar';

  type DocumentTreeNode = {
    id: string;
    name: string;
    path: string;
    kind: 'folder' | 'file';
    children: DocumentTreeNode[];
    entry?: MarkdownDocumentEntry;
  };

  let {
    component,
    name,
    active,
  } = $props<{
    component: string;
    name: string;
    active: boolean;
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
  let viewMode = $state<'preview' | 'source'>('preview');
  let expandedFolders = $state<Set<string>>(new Set());
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

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
  const overEditLimit = $derived(draftContent.length > 512 * 1024);
  const canSave = $derived(pathValid && !overEditLimit && dirty && !saving && !deleting);
  const storeTicketsInstance = $derived(component === 'nulltickets' ? name : '');
  const softStoreError = $derived(error.trim().toLowerCase() === 'not found');
  const renderedMarkdown = $derived(renderMarkdown(draftContent));
  const documentTree = $derived(buildDocumentTree(documents));
  const selectedFileName = $derived(fileName(draftPath) || 'Docs');
  const materialIconBase = '/file-icons/material';

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
    const normalized = normalizeMarkdownPath(path);
    return documents.some((entry) => normalizeMarkdownPath(entry.document.path) === normalized && entry.key !== ignoredKey);
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

  function fileName(path: string): string {
    const normalized = normalizeMarkdownPath(path);
    return normalized.split('/').pop() || normalized;
  }

  function directoryName(path: string): string {
    const normalized = normalizeMarkdownPath(path);
    const slash = normalized.lastIndexOf('/');
    return slash > 0 ? normalized.slice(0, slash) : '';
  }

  function fileExtension(path: string): string {
    const name = fileName(path);
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  }

  function materialFileIconName(path: string): string {
    const ext = fileExtension(path);
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    return 'file';
  }

  function materialFolderIconName(name: string, expanded: boolean): string {
    const lower = name.toLowerCase();
    if (lower === 'docs' && expanded) return 'folder-markdown-open';
    if (lower === 'skills' && expanded) return 'folder-skills-open';
    return expanded ? 'folder-open' : 'folder';
  }

  function materialIconUrl(name: string): string {
    return `${materialIconBase}/${name}.svg`;
  }

  function pathAncestors(path: string): string[] {
    const parts = normalizeMarkdownPath(path).split('/').filter(Boolean);
    const ancestors: string[] = [];
    for (let index = 0; index < parts.length - 1; index += 1) {
      ancestors.push(parts.slice(0, index + 1).join('/'));
    }
    return ancestors;
  }

  function expandAncestors(path: string) {
    const ancestors = pathAncestors(path);
    if (ancestors.length === 0) return;
    expandedFolders = new Set([...expandedFolders, ...ancestors]);
  }

  function toggleFolder(path: string) {
    const next = new Set(expandedFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    expandedFolders = next;
  }

  function sortTreeNodes(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
    return nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  function buildDocumentTree(entries: MarkdownDocumentEntry[]): DocumentTreeNode[] {
    const roots: DocumentTreeNode[] = [];
    const folders = new Map<string, DocumentTreeNode>();

    function folderNode(path: string, name: string): DocumentTreeNode {
      const existing = folders.get(path);
      if (existing) return existing;
      const node: DocumentTreeNode = { id: `folder:${path}`, name, path, kind: 'folder', children: [] };
      folders.set(path, node);
      const parentPath = directoryName(path);
      if (parentPath) folderNode(parentPath, fileName(parentPath)).children.push(node);
      else roots.push(node);
      return node;
    }

    for (const entry of entries) {
      const path = normalizeMarkdownPath(entry.document.path);
      const dir = directoryName(path);
      const node: DocumentTreeNode = {
        id: entry.key,
        name: fileName(path),
        path,
        kind: 'file',
        children: [],
        entry,
      };
      if (dir) folderNode(dir, fileName(dir)).children.push(node);
      else roots.push(node);
    }

    for (const folder of folders.values()) {
      folder.children = sortTreeNodes(folder.children);
    }
    return sortTreeNodes(roots);
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
      viewMode = 'preview';
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
    expandAncestors(entry.document.path);
    viewMode = 'preview';
  }

  async function refresh() {
    error = '';
    message = '';
    try {
      documents = await listMarkdownDocuments(component, name, storeTicketsInstance);
      if (selectedKey) {
        const next = documents.find((entry) => entry.key === selectedKey) || null;
        if (next && !dirty) await loadDocumentKey(next.key);
        else if (!next && !dirty && documents[0]) await loadDocumentKey(documents[0].key);
        else if (!next && !dirty) loadDraft(null);
      } else if (documents.length > 0 && !dirty) {
        await loadDocumentKey(documents[0].key);
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function loadDocumentKey(key: string) {
    const entry = await getMarkdownDocument(key, component, name, storeTicketsInstance);
    loadDraft(entry);
  }

  async function selectDocument(key: string) {
    if (dirty && !confirm('Discard unsaved Markdown changes?')) return;
    error = '';
    message = '';
    try {
      await loadDocumentKey(key);
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
      source: 'workspace',
      created_at_ms: Date.now(),
      updated_at_ms: Date.now(),
      artifact_id: null,
    };
    loadDraft({ key: '', document, created_at_ms: null, updated_at_ms: null });
    viewMode = 'source';
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
      message = '';
      await refresh();
      loadDraft(saved);
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

  function renderMarkdown(markdown: string): string {
    return sanitizeHtml(marked.parse(escapeRawHtml(stripYamlFrontmatter(markdown)), { gfm: true, async: false }) as string);
  }

  function stripYamlFrontmatter(markdown: string): string {
    return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  }

  function escapeRawHtml(markdown: string): string {
    return markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;');
  }

  function decodeHtmlEntities(value: string): string {
    const named: Record<string, string> = {
      amp: '&',
      colon: ':',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
    };
    return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower.startsWith('#x')) {
        const codePoint = Number.parseInt(lower.slice(2), 16);
        return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
      }
      if (lower.startsWith('#')) {
        const codePoint = Number.parseInt(lower.slice(1), 10);
        return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
      }
      return named[lower] ?? match;
    });
  }

  function isUnsafeUrlAttribute(value: string): boolean {
    const normalized = decodeHtmlEntities(value)
      .trim()
      .replace(/[\u0000-\u001f\u007f\s]+/gu, '')
      .toLowerCase();
    if (normalized.startsWith('javascript:')) return true;
    if (normalized.startsWith('data:')) {
      return !/^data:image\/(?:png|jpeg|gif|webp)(?:[;,]|$)/iu.test(normalized);
    }
    return false;
  }

  function sanitizeUrlAttribute(match: string, attr: string, quote: string, value: string): string {
    if (isUnsafeUrlAttribute(value)) return `${attr}=${quote}#${quote}`;
    return match;
  }

  function sanitizeHtml(html: string): string {
    return html
      .replace(/<\/?(?:script|iframe|object|embed|style|link|meta|base)\b[^>]*>/giu, '')
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/giu, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/giu, '')
      .replace(/\son[a-z]+\s*=\s*[^\s>]+/giu, '')
      .replace(/\b(href|src)\s*=\s*(")([^"]*)"/giu, sanitizeUrlAttribute)
      .replace(/\b(href|src)\s*=\s*(')([^']*)'/giu, sanitizeUrlAttribute);
  }

  $effect(() => {
    const key = `${component}/${name}/${active}`;
    if (!active || loadKey === key) return;
    loadKey = key;
    loadDraft(null);
    void refresh();
  });

  $effect(() => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (!active || !canSave) return;
    const snapshot = draftSnapshot;
    autoSaveTimer = setTimeout(() => {
      if (snapshot === draftSnapshot && canSave) void saveDraft();
    }, 700);
    return () => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
    };
  });

  $effect(() => {
    if (!active) {
      headerToolbar.set(null);
      return;
    }
    headerToolbar.set({
      crumbLabel: selectedFileName,
      actions: [
        {
          id: 'preview',
          label: 'Preview',
          active: viewMode === 'preview',
          onClick: () => {
            viewMode = 'preview';
          },
        },
        {
          id: 'source',
          label: 'Source',
          active: viewMode === 'source',
          onClick: () => {
            viewMode = 'source';
          },
        },
        {
          id: 'new',
          label: 'New',
          onClick: newDocument,
        },
        ...(dirty || saving
          ? [
              {
                id: 'save',
                label: saving ? 'Saving' : 'Save',
                primary: canSave,
                disabled: !canSave,
                onClick: saveDraft,
              },
            ]
          : []),
      ],
    });
  });

  onDestroy(() => {
    headerToolbar.set(null);
  });
</script>

{#snippet treeNode(node: DocumentTreeNode, depth: number)}
  {@const expanded = expandedFolders.has(node.path)}
  <button
    class="tree-row"
    class:folder={node.kind === 'folder'}
    class:file={node.kind === 'file'}
    class:active={node.entry?.key === selectedKey}
    style={`--depth: ${depth}`}
    aria-expanded={node.kind === 'folder' ? expanded : undefined}
    onclick={() => {
      if (node.kind === 'folder') toggleFolder(node.path);
      else if (node.entry) void selectDocument(node.entry.key);
    }}
  >
    {#if node.kind === 'folder'}
      <span class={expanded ? 'tree-chevron open' : 'tree-chevron'} aria-hidden="true"></span>
      <img class="tree-icon" src={materialIconUrl(materialFolderIconName(node.name, expanded))} alt="" aria-hidden="true" draggable="false" />
      <span class="tree-name">{node.name}</span>
    {:else}
      <span class="tree-spacer" aria-hidden="true"></span>
      <img class="tree-icon" src={materialIconUrl(materialFileIconName(node.path))} alt="" aria-hidden="true" draggable="false" />
      <span class="tree-name">{node.name}</span>
    {/if}
  </button>
  {#if node.kind === 'folder' && expanded}
    {#each node.children as child (child.id)}
      {@render treeNode(child, depth + 1)}
    {/each}
  {/if}
{/snippet}

<div class="markdown-manager">
  <section class="document-list" aria-label="Markdown files">
    <div class="document-list-header">
      <span>Files</span>
      <span class="document-list-meta">
        <span>{documents.length}</span>
        {#if selectedKey}
          <button class="panel-delete" type="button" disabled={deleting} onclick={removeDraft}>
            {deleteConfirmKey === selectedKey ? 'Confirm' : 'Delete'}
          </button>
        {/if}
      </span>
    </div>
    {#if documentTree.length > 0}
      <div class="doc-scroll">
        {#each documentTree as node (node.id)}
          {@render treeNode(node, 0)}
        {/each}
      </div>
    {:else}
      <div class="empty-list">No Markdown files</div>
    {/if}
  </section>

  <section class="editor-shell" aria-label="Markdown editor">
    <div class="status-row">
      {#if error && !softStoreError}
        <span class="inline-error">{error}</span>
      {:else if overEditLimit}
        <span class="inline-error">Read-only - this Markdown document is over the 512 KB edit limit.</span>
      {:else if message}
        <span class="inline-message">{message}</span>
      {/if}
    </div>

    <div class="document-surface">
      {#if viewMode === 'preview'}
        <div class="preview-pane" aria-label="Rendered Markdown">
          {#if draftContent.trim()}
            <div class="prose-preview">
              {@html renderedMarkdown}
            </div>
          {:else}
            <div class="empty-preview">
              <span>No Markdown content</span>
            </div>
          {/if}
        </div>
      {:else}
        <textarea aria-label="Markdown source" bind:value={draftContent} onkeydown={handleEditorKeydown} spellcheck="false"></textarea>
      {/if}
    </div>
  </section>
</div>

<style>
  .markdown-manager {
    display: grid;
    grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
    gap: 0;
    width: 100%;
    height: 100%;
    padding: 0;
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

  button.active {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
  }

  textarea {
    width: 100%;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--fg);
    padding: 5px 8px;
    font: inherit;
  }

  textarea {
    min-height: 0;
    height: 100%;
    padding: 24px 28px 48px;
    resize: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    line-height: 1.5;
    outline: none;
  }

  .status-row {
    min-height: 0;
  }

  .inline-error,
  .inline-message {
    display: block;
    min-height: 0;
    overflow: hidden;
    padding: 0 2px 4px;
    font-size: 12px;
    line-height: 18px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .inline-error {
    color: var(--error);
  }

  .inline-message {
    color: var(--success);
  }

  .document-surface {
    min-height: 0;
    overflow: hidden;
  }

  .preview-pane {
    height: 100%;
    min-height: 0;
    overflow: auto;
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 24px 32px 56px;
  }

  .prose-preview {
    max-width: 980px;
    color: var(--fg);
    overflow-wrap: anywhere;
  }

  .prose-preview :global(h1),
  .prose-preview :global(h2),
  .prose-preview :global(h3) {
    margin: 1.05em 0 0.45em;
    color: var(--fg);
    font-weight: 650;
    line-height: 1.18;
  }

  .prose-preview :global(h1) {
    font-size: 26px;
  }

  .prose-preview :global(h2) {
    font-size: 19px;
  }

  .prose-preview :global(h3) {
    font-size: 16px;
  }

  .prose-preview :global(p),
  .prose-preview :global(ul),
  .prose-preview :global(ol),
  .prose-preview :global(pre),
  .prose-preview :global(table),
  .prose-preview :global(blockquote) {
    margin: 0.75em 0;
  }

  .prose-preview :global(ul),
  .prose-preview :global(ol) {
    padding-left: 1.4em;
  }

  .prose-preview :global(a) {
    color: var(--accent);
    text-decoration: underline;
  }

  .prose-preview :global(code) {
    border-radius: 4px;
    background: var(--bg-hover);
    padding: 0.1rem 0.25rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 0.92em;
  }

  .prose-preview :global(pre) {
    overflow-x: auto;
    overflow-y: visible;
    border: 0;
    border-radius: 6px;
    background: var(--bg-hover);
    padding: 0.85rem;
  }

  .prose-preview :global(pre code) {
    background: transparent;
    padding: 0;
  }

  .prose-preview :global(blockquote) {
    border-left: 3px solid var(--border);
    color: var(--fg-dim);
    padding-left: 0.85rem;
  }

  .prose-preview :global(table) {
    display: block;
    width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
  }

  .prose-preview :global(th),
  .prose-preview :global(td) {
    border: 1px solid var(--border);
    padding: 0.5rem 0.75rem;
    text-align: left;
  }

  .prose-preview :global(th) {
    background: var(--bg-hover);
    font-weight: 650;
    white-space: nowrap;
  }

  .prose-preview :global(img) {
    display: block;
    max-width: 100%;
    margin: 1em 0;
  }

  .empty-preview {
    display: grid;
    height: 100%;
    min-height: 180px;
    place-items: center;
    color: var(--fg-dim);
  }

  .document-list,
  .editor-shell {
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .editor-shell {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    padding: 0;
  }

  .document-list {
    min-height: 0;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    border-right: 1px solid var(--shadcn-border);
    padding: 10px 8px;
  }

  .document-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 6px 8px;
    color: var(--fg-dim);
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0;
  }

  .document-list-meta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .panel-delete {
    min-width: 0;
    min-height: 0;
    height: 24px;
    border: 0;
    background: transparent;
    color: var(--error);
    padding: 0 4px;
    font-size: 12px;
    font-weight: 650;
  }

  .panel-delete:hover:not(:disabled) {
    background: color-mix(in srgb, var(--error) 8%, transparent);
  }

  .doc-scroll {
    min-height: 0;
    overflow: auto;
    width: 100%;
  }

  .tree-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
    min-height: 30px;
    margin-bottom: 1px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--fg);
    padding: 0 6px;
    padding-left: calc(6px + var(--depth, 0) * 14px);
    text-align: left;
  }

  .tree-row:hover {
    background: var(--bg-hover);
  }

  .tree-row.active {
    background: #18181b;
    color: #fff;
  }

  .tree-row.active .tree-name {
    color: #fff;
  }

  .tree-chevron {
    width: 13px;
    height: 13px;
    flex: 0 0 auto;
    color: var(--fg-dim);
    position: relative;
    transition: transform 120ms ease;
  }

  .tree-chevron::before {
    content: "";
    position: absolute;
    left: 4px;
    top: 3px;
    width: 6px;
    height: 6px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg);
  }

  .tree-chevron.open {
    transform: rotate(90deg);
  }

  .tree-row.active .tree-chevron {
    color: currentColor;
  }

  .tree-spacer {
    width: 13px;
    height: 13px;
    flex: 0 0 auto;
  }

  .tree-icon {
    width: 17px;
    height: 17px;
    flex: 0 0 auto;
    object-fit: contain;
  }

  .tree-name {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    font-size: 13px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-list {
    display: grid;
    place-items: center;
    color: var(--fg-dim);
    font-size: 13px;
    min-height: 120px;
  }

  @media (max-width: 920px) {
    .markdown-manager {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(120px, 28vh) minmax(0, 1fr);
      padding: 0;
    }

    .document-list {
      border-right: 0;
      border-bottom: 1px solid var(--shadcn-border);
    }

    textarea {
      min-height: 0;
      padding: 18px 16px 32px;
    }

    .preview-pane {
      padding: 18px 16px 36px;
    }
  }
</style>
