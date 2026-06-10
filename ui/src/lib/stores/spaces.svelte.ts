import { spacesApi } from '$lib/api/client';
import { selectedSpaceQuery, type Space, type SpaceCreateInput, type SpacesApi, type SpaceSelection, type SpaceUpdateInput } from '$lib/api/spaces';

export const SELECTED_SPACE_STORAGE_KEY = 'nullhub:selected-space';
const ALL_SPACES_STORAGE_VALUE = '__all__';

type SpaceStoreStatus = 'idle' | 'loading' | 'ready' | 'error';
type SpaceStoreStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type SpaceStoreHistory = Pick<History, 'replaceState'>;
type SpaceStoreLocation = Pick<Location, 'href'>;

type SpacesStoreOptions = {
  api: SpacesApi;
  storage?: SpaceStoreStorage | null;
  location?: SpaceStoreLocation | null;
  history?: SpaceStoreHistory | null;
};

function isSpaceStoreStorage(value: unknown): value is SpaceStoreStorage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SpaceStoreStorage>;
  return typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function';
}

function browserStorage(): SpaceStoreStorage | null {
  return typeof localStorage === 'undefined' || !isSpaceStoreStorage(localStorage) ? null : localStorage;
}

function browserLocation(): SpaceStoreLocation | null {
  return typeof window === 'undefined' ? null : window.location;
}

function browserHistory(): SpaceStoreHistory | null {
  return typeof history === 'undefined' ? null : history;
}

function readUrlSelection(location: SpaceStoreLocation | null): SpaceSelection | undefined {
  if (!location?.href) return undefined;
  const params = new URL(location.href).searchParams;
  if (!params.has('space')) return undefined;
  const value = params.get('space')?.trim() ?? '';
  return value || null;
}

function readPersistedSelection(storage: SpaceStoreStorage | null): SpaceSelection | undefined {
  const value = storage?.getItem(SELECTED_SPACE_STORAGE_KEY)?.trim();
  if (!value) return undefined;
  return value === ALL_SPACES_STORAGE_VALUE ? null : value;
}

function persistSelection(storage: SpaceStoreStorage | null, selectedSpaceId: SpaceSelection) {
  if (!storage) return;
  storage.setItem(SELECTED_SPACE_STORAGE_KEY, selectedSpaceId || ALL_SPACES_STORAGE_VALUE);
}

function syncUrlSelection(
  location: SpaceStoreLocation | null,
  history: SpaceStoreHistory | null,
  selectedSpaceId: SpaceSelection,
) {
  if (!location?.href || !history) return;
  const url = new URL(location.href);
  if (selectedSpaceId) url.searchParams.set('space', selectedSpaceId);
  else url.searchParams.delete('space');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SpacesStore {
  readonly api: SpacesApi;
  readonly storage: SpaceStoreStorage | null;
  readonly location: SpaceStoreLocation | null;
  readonly history: SpaceStoreHistory | null;

  spaces = $state<Space[]>([]);
  selectedSpaceId = $state<SpaceSelection>(null);
  status = $state<SpaceStoreStatus>('idle');
  error = $state<string | null>(null);
  selectedSpace = $derived.by(() => this.spaces.find((space) => space.id === this.selectedSpaceId) ?? null);
  isAllSelected = $derived.by(() => this.selectedSpaceId === null);
  selectedSpaceQuery = $derived.by(() => selectedSpaceQuery(this.selectedSpaceId));

  constructor(options: SpacesStoreOptions) {
    this.api = options.api;
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    this.location = options.location === undefined ? browserLocation() : options.location;
    this.history = options.history === undefined ? browserHistory() : options.history;
    this.selectedSpaceId = readUrlSelection(this.location) ?? readPersistedSelection(this.storage) ?? null;
  }

  async load(): Promise<Space[]> {
    this.status = 'loading';
    this.error = null;
    try {
      const spaces = await this.api.listSpaces();
      this.spaces = spaces;
      this.status = 'ready';
      return spaces;
    } catch (error) {
      this.status = 'error';
      this.error = errorMessage(error);
      throw error;
    }
  }

  selectSpace(spaceId: string): void {
    this.setSelection(spaceId);
  }

  selectAll(): void {
    this.setSelection(null);
  }

  async createSpace(input: SpaceCreateInput): Promise<Space> {
    const created = await this.api.createSpace(input);
    this.upsertSpace(created);
    this.selectSpace(created.id);
    return created;
  }

  async updateSpace(spaceId: string, input: SpaceUpdateInput): Promise<Space> {
    const updated = await this.api.updateSpace(spaceId, input);
    this.upsertSpace(updated);
    return updated;
  }

  private setSelection(spaceId: SpaceSelection): void {
    this.selectedSpaceId = spaceId;
    persistSelection(this.storage, spaceId);
    syncUrlSelection(this.location, this.history, spaceId);
  }

  private upsertSpace(space: Space): void {
    const index = this.spaces.findIndex((existing) => existing.id === space.id);
    if (index < 0) {
      this.spaces = [...this.spaces, space];
      return;
    }
    const nextSpaces = [...this.spaces];
    nextSpaces[index] = space;
    this.spaces = nextSpaces;
  }
}

export const spacesStore = new SpacesStore({ api: spacesApi });
