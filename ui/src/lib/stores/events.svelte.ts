import { eventsApi, type EventListParams, type EventListPage, type EventsApi, type NullHubEvent } from '$lib/api/client';
import { pollWhileVisible, type PollStop } from '$lib/poll';

export type EventsStoreStatus = 'idle' | 'loading' | 'ready' | 'error';
type PollWhileVisible = (tick: () => void | Promise<void>, intervalMs: number) => PollStop;

type EventsStoreOptions = {
  api: EventsApi;
  poller?: PollWhileVisible;
};

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class EventsStore {
  readonly api: EventsApi;
  readonly poller: PollWhileVisible;

  events = $state<NullHubEvent[]>([]);
  status = $state<EventsStoreStatus>('idle');
  error = $state<string | null>(null);
  hasMore = $state(false);
  nextCursor = $state<string | null>(null);
  params = $state<EventListParams>({});

  private stopPolling: PollStop | null = null;
  private requestVersion = 0;

  constructor(options: EventsStoreOptions) {
    this.api = options.api;
    this.poller = options.poller ?? pollWhileVisible;
  }

  async load(params: EventListParams = this.params): Promise<EventListPage> {
    const version = this.nextRequestVersion();
    this.params = { ...params };
    this.status = 'loading';
    this.error = null;
    try {
      const page = await this.api.listEvents(this.params);
      if (!this.isCurrentRequest(version)) return page;
      this.applyPage(page);
      this.status = 'ready';
      return page;
    } catch (error) {
      if (this.isCurrentRequest(version)) {
        this.status = 'error';
        this.error = messageFromError(error);
      }
      throw error;
    }
  }

  async refresh(params: EventListParams = this.params): Promise<EventListPage> {
    const version = this.nextRequestVersion();
    this.params = { ...params };
    try {
      const page = await this.api.listEvents(this.params);
      if (!this.isCurrentRequest(version)) return page;
      this.applyPage(page);
      this.status = 'ready';
      this.error = null;
      return page;
    } catch (error) {
      if (this.isCurrentRequest(version)) {
        this.status = 'error';
        this.error = messageFromError(error);
      }
      throw error;
    }
  }

  async loadNextPage(): Promise<EventListPage | null> {
    if (!this.hasMore || !this.nextCursor) return null;
    const version = this.nextRequestVersion();
    try {
      const page = await this.api.listEvents({ ...this.params, cursor: this.nextCursor });
      if (!this.isCurrentRequest(version)) return page;
      this.events = [...this.events, ...page.events];
      this.hasMore = page.hasMore;
      this.nextCursor = page.nextCursor;
      this.status = 'ready';
      this.error = null;
      return page;
    } catch (error) {
      if (this.isCurrentRequest(version)) {
        this.status = 'error';
        this.error = messageFromError(error);
      }
      throw error;
    }
  }

  startPolling(params: EventListParams = this.params, intervalMs = 5000): PollStop {
    this.stop();
    this.reset(params, 'loading');
    void this.refreshForPolling();
    this.stopPolling = this.poller(() => this.refreshForPolling(), intervalMs);
    return () => this.stop();
  }

  reset(params: EventListParams = this.params, status: EventsStoreStatus = 'idle'): void {
    this.requestVersion += 1;
    this.params = { ...params };
    this.events = [];
    this.status = status;
    this.error = null;
    this.hasMore = false;
    this.nextCursor = null;
  }

  stop(): void {
    if (!this.stopPolling) return;
    this.stopPolling();
    this.stopPolling = null;
  }

  private applyPage(page: EventListPage): void {
    this.events = page.events;
    this.hasMore = page.hasMore;
    this.nextCursor = page.nextCursor;
  }

  private nextRequestVersion(): number {
    this.requestVersion += 1;
    return this.requestVersion;
  }

  private isCurrentRequest(version: number): boolean {
    return version === this.requestVersion;
  }

  private async refreshForPolling(): Promise<void> {
    try {
      await this.refresh(this.params);
    } catch {
      // Polling is best-effort; refresh() has already recorded status/error.
    }
  }
}

export const eventsStore = new EventsStore({ api: eventsApi });
