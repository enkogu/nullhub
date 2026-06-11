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

  constructor(options: EventsStoreOptions) {
    this.api = options.api;
    this.poller = options.poller ?? pollWhileVisible;
  }

  async load(params: EventListParams = this.params): Promise<EventListPage> {
    this.params = { ...params };
    this.status = 'loading';
    this.error = null;
    try {
      const page = await this.api.listEvents(this.params);
      this.applyPage(page);
      this.status = 'ready';
      return page;
    } catch (error) {
      this.status = 'error';
      this.error = messageFromError(error);
      throw error;
    }
  }

  async refresh(params: EventListParams = this.params): Promise<EventListPage> {
    this.params = { ...params };
    try {
      const page = await this.api.listEvents(this.params);
      this.applyPage(page);
      this.status = 'ready';
      this.error = null;
      return page;
    } catch (error) {
      this.status = 'error';
      this.error = messageFromError(error);
      throw error;
    }
  }

  async loadNextPage(): Promise<EventListPage | null> {
    if (!this.hasMore || !this.nextCursor) return null;
    try {
      const page = await this.api.listEvents({ ...this.params, cursor: this.nextCursor });
      this.events = [...this.events, ...page.events];
      this.hasMore = page.hasMore;
      this.nextCursor = page.nextCursor;
      this.status = 'ready';
      this.error = null;
      return page;
    } catch (error) {
      this.status = 'error';
      this.error = messageFromError(error);
      throw error;
    }
  }

  startPolling(params: EventListParams = this.params, intervalMs = 5000): PollStop {
    this.stop();
    this.params = { ...params };
    void this.refreshForPolling();
    this.stopPolling = this.poller(() => this.refreshForPolling(), intervalMs);
    return () => this.stop();
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

  private async refreshForPolling(): Promise<void> {
    try {
      await this.refresh(this.params);
    } catch {
      // Polling is best-effort; refresh() has already recorded status/error.
    }
  }
}

export const eventsStore = new EventsStore({ api: eventsApi });
