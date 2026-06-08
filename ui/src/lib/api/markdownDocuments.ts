import { api, nullTicketsStoreApi } from '$lib/api/client';

export const MARKDOWN_DOCUMENT_NAMESPACE = 'markdown.documents';

export type MarkdownDocument = {
  schema_version: 1;
  title: string;
  path: string;
  content: string;
  tags: string[];
  owner_component: string;
  owner_instance: string;
  source: 'store' | 'workspace';
  created_at_ms: number;
  updated_at_ms: number;
  artifact_id: string | null;
};

export type MarkdownDocumentEntry = {
  key: string;
  document: MarkdownDocument;
  created_at_ms: number | null;
  updated_at_ms: number | null;
};

type StoreEntry =
  | string
  | {
      key?: string;
      value?: unknown;
      created_at_ms?: number;
      updated_at_ms?: number;
    };

type MarkdownDocumentInput = {
  title: string;
  path: string;
  content: string;
  tags: string[];
  artifact_id?: string | null;
};

type WorkspaceDocumentMeta = {
  path: string;
  title?: string;
  content?: string;
  source?: 'workspace';
  size_bytes?: number;
  updated_at_ms?: number;
};

export function normalizeMarkdownPath(path: string): string {
  return path
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
}

export function isValidMarkdownPath(path: string): boolean {
  const raw = path.trim().replaceAll('\\', '/');
  if (!raw || raw.startsWith('/') || raw.split('/').includes('..')) return false;
  const normalized = normalizeMarkdownPath(path);
  if (!normalized) return false;
  return normalized.endsWith('.md') || normalized.endsWith('.markdown');
}

export function markdownDocumentKey(component: string, name: string, path: string): string {
  return `${component}/${name}/${normalizeMarkdownPath(path)}`;
}

function workspaceDocumentKey(component: string, name: string, path: string): string {
  return `workspace:${component}/${name}/${normalizeMarkdownPath(path)}`;
}

function isWorkspaceDocumentKey(key: string): boolean {
  return key.startsWith('workspace:');
}

function pathFromWorkspaceDocumentKey(key: string, component: string, name: string): string {
  const prefix = `workspace:${component}/${name}/`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : '';
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function titleFromPath(path: string): string {
  const file = path.split('/').pop() || path;
  return file.replace(/\.(md|markdown)$/i, '').replaceAll('-', ' ').replaceAll('_', ' ');
}

function normalizeDocument(value: any, component: string, name: string, fallbackPath: string): MarkdownDocument {
  const now = Date.now();
  const path = normalizeMarkdownPath(String(value?.path || fallbackPath || 'untitled.md'));
  return {
    schema_version: 1,
    title: String(value?.title || titleFromPath(path)),
    path,
    content: String(value?.content || ''),
    tags: asTags(value?.tags),
    owner_component: typeof value?.owner_component === 'string' ? value.owner_component : '',
    owner_instance: typeof value?.owner_instance === 'string' ? value.owner_instance : '',
    source: 'store',
    created_at_ms: Number.isFinite(value?.created_at_ms) ? Number(value.created_at_ms) : now,
    updated_at_ms: Number.isFinite(value?.updated_at_ms) ? Number(value.updated_at_ms) : now,
    artifact_id: typeof value?.artifact_id === 'string' && value.artifact_id ? value.artifact_id : null,
  };
}

function normalizeWorkspaceDocument(
  value: WorkspaceDocumentMeta,
  component: string,
  name: string,
): MarkdownDocumentEntry {
  const now = Date.now();
  const path = normalizeMarkdownPath(String(value.path || 'untitled.md'));
  const updated = Number.isFinite(value.updated_at_ms) ? Number(value.updated_at_ms) : now;
  const document: MarkdownDocument = {
    schema_version: 1,
    title: String(value.title || titleFromPath(path)),
    path,
    content: String(value.content || ''),
    tags: [],
    owner_component: component,
    owner_instance: name,
    source: 'workspace',
    created_at_ms: updated,
    updated_at_ms: updated,
    artifact_id: null,
  };
  return {
    key: workspaceDocumentKey(component, name, path),
    document,
    created_at_ms: null,
    updated_at_ms: updated,
  };
}

function entryKey(entry: StoreEntry): string {
  if (typeof entry === 'string') return entry;
  return String(entry?.key || '');
}

function entryPath(key: string, component: string, name: string): string {
  const prefix = `${component}/${name}/`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function normalizeEntry(entry: StoreEntry, component: string, name: string): MarkdownDocumentEntry | null {
  if (typeof entry === 'string') return null;
  const key = entryKey(entry);
  if (!key) return null;
  if (!key.startsWith(`${component}/${name}/`)) return null;
  const document = normalizeDocument(entry.value, component, name, entryPath(key, component, name));
  if (document.owner_component !== component || document.owner_instance !== name) return null;
  return {
    key,
    document,
    created_at_ms: typeof entry.created_at_ms === 'number' ? entry.created_at_ms : null,
    updated_at_ms: typeof entry.updated_at_ms === 'number' ? entry.updated_at_ms : null,
  };
}

async function resolveListedEntry(entry: StoreEntry, ticketsInstance?: string): Promise<StoreEntry | null> {
  if (typeof entry !== 'string' && entry.value !== undefined) return entry;
  const key = entryKey(entry);
  if (!key) return null;
  return nullTicketsStoreApi.storeGet(MARKDOWN_DOCUMENT_NAMESPACE, key, ticketsInstance).catch(() => null);
}

function sortDocuments(entries: MarkdownDocumentEntry[]): MarkdownDocumentEntry[] {
  return [...entries].sort((a, b) => {
    const bTime = b.document.updated_at_ms || b.updated_at_ms || 0;
    const aTime = a.document.updated_at_ms || a.updated_at_ms || 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.document.path.localeCompare(b.document.path);
  });
}

function documentMatchesQuery(entry: MarkdownDocumentEntry, query: string): boolean {
  const q = query.toLowerCase();
  const doc = entry.document;
  return [
    entry.key,
    doc.title,
    doc.path,
    doc.content,
    ...(doc.tags || []),
  ].some((value) => String(value).toLowerCase().includes(q));
}

export async function listMarkdownDocuments(
  component: string,
  name: string,
  ticketsInstance?: string,
): Promise<MarkdownDocumentEntry[]> {
  const workspaceEntries = await api
    .listDocs(component, name)
    .then((result) => {
      const documents = Array.isArray(result?.documents) ? result.documents : [];
      return documents
        .map((entry: WorkspaceDocumentMeta) => normalizeWorkspaceDocument(entry, component, name))
        .filter((entry: MarkdownDocumentEntry) => isValidMarkdownPath(entry.document.path));
    })
    .catch(() => [] as MarkdownDocumentEntry[]);

  const storeEntries = await Promise.all(
    ((await nullTicketsStoreApi.storeList(MARKDOWN_DOCUMENT_NAMESPACE, ticketsInstance).catch(() => [])) || []).map((entry: StoreEntry) =>
      resolveListedEntry(entry, ticketsInstance),
    ),
  );
  return sortDocuments([
    ...workspaceEntries,
    ...storeEntries
      .map((entry) => (entry ? normalizeEntry(entry, component, name) : null))
      .filter((entry): entry is MarkdownDocumentEntry => entry !== null),
  ]);
}

export async function searchMarkdownDocuments(
  component: string,
  name: string,
  query: string,
  ticketsInstance?: string,
): Promise<MarkdownDocumentEntry[]> {
  const q = query.trim();
  if (!q) return listMarkdownDocuments(component, name, ticketsInstance);
  return (await listMarkdownDocuments(component, name, ticketsInstance)).filter((entry) =>
    documentMatchesQuery(entry, q),
  );
}

export async function getMarkdownDocument(
  key: string,
  component: string,
  name: string,
  ticketsInstance?: string,
): Promise<MarkdownDocumentEntry> {
  if (isWorkspaceDocumentKey(key)) {
    const path = pathFromWorkspaceDocumentKey(key, component, name);
    if (!path) throw new Error('Markdown document was not found in this instance scope.');
    const entry = await api.getDoc(component, name, path);
    return normalizeWorkspaceDocument(entry, component, name);
  }
  const entry = await nullTicketsStoreApi.storeGet(MARKDOWN_DOCUMENT_NAMESPACE, key, ticketsInstance);
  const normalized = normalizeEntry(entry, component, name);
  if (!normalized) throw new Error('Markdown document was not found in this instance scope.');
  return normalized;
}

export async function saveMarkdownDocument(
  component: string,
  name: string,
  input: MarkdownDocumentInput,
  previousKey?: string,
  ticketsInstance?: string,
): Promise<MarkdownDocumentEntry> {
  if (!isValidMarkdownPath(input.path)) {
    throw new Error('Use a relative Markdown path ending in .md or .markdown.');
  }

  const path = normalizeMarkdownPath(input.path);
  if (!previousKey || isWorkspaceDocumentKey(previousKey)) {
    const previousPath = previousKey ? pathFromWorkspaceDocumentKey(previousKey, component, name) : '';
    const saved = normalizeWorkspaceDocument(
      await api.saveDoc(component, name, path, input.content),
      component,
      name,
    );
    if (previousPath && previousPath !== path) {
      await api.deleteDoc(component, name, previousPath).catch(() => undefined);
    }
    return saved;
  }

  const now = Date.now();
  const key = markdownDocumentKey(component, name, path);
  if (previousKey !== key) {
    const existingTarget = await nullTicketsStoreApi
      .storeGet(MARKDOWN_DOCUMENT_NAMESPACE, key, ticketsInstance)
      .catch(() => null);
    if (existingTarget) {
      throw new Error('A Markdown document already exists at this path.');
    }
  }
  const existingCreatedAt =
    previousKey === key
      ? (await nullTicketsStoreApi.storeGet(MARKDOWN_DOCUMENT_NAMESPACE, key, ticketsInstance).catch(() => null))
          ?.value?.created_at_ms
      : null;
  const document: MarkdownDocument = {
    schema_version: 1,
    title: input.title.trim() || titleFromPath(path),
    path,
    content: input.content,
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    owner_component: component,
    owner_instance: name,
    source: 'store',
    created_at_ms: Number.isFinite(existingCreatedAt) ? Number(existingCreatedAt) : now,
    updated_at_ms: now,
    artifact_id: input.artifact_id || null,
  };

  await nullTicketsStoreApi.storePut(MARKDOWN_DOCUMENT_NAMESPACE, key, document, ticketsInstance);
  if (previousKey && previousKey !== key) {
    try {
      await nullTicketsStoreApi.storeDelete(MARKDOWN_DOCUMENT_NAMESPACE, previousKey, ticketsInstance);
    } catch (e) {
      await nullTicketsStoreApi.storeDelete(MARKDOWN_DOCUMENT_NAMESPACE, key, ticketsInstance).catch(() => undefined);
      throw e;
    }
  }
  return { key, document, created_at_ms: document.created_at_ms, updated_at_ms: document.updated_at_ms };
}

export async function deleteMarkdownDocument(key: string, ticketsInstance?: string): Promise<void> {
  if (isWorkspaceDocumentKey(key)) {
    const withoutPrefix = key.slice('workspace:'.length);
    const first = withoutPrefix.indexOf('/');
    const second = first >= 0 ? withoutPrefix.indexOf('/', first + 1) : -1;
    if (second < 0) throw new Error('Markdown document was not found in this instance scope.');
    const component = withoutPrefix.slice(0, first);
    const name = withoutPrefix.slice(first + 1, second);
    const path = withoutPrefix.slice(second + 1);
    await api.deleteDoc(component, name, path);
    return;
  }
  await nullTicketsStoreApi.storeDelete(MARKDOWN_DOCUMENT_NAMESPACE, key, ticketsInstance);
}
