import { approvalsApi, type ApprovalListParams, type ApprovalsApi } from '$lib/api/client';
import { pollWhileVisible, type PollStop } from '$lib/poll';

export type NeedsYouStoreStatus = 'idle' | 'loading' | 'ready' | 'error';
type PollWhileVisible = (tick: () => void | Promise<void>, intervalMs: number) => PollStop;

type NeedsYouStoreOptions = {
  api: Pick<ApprovalsApi, 'listApprovals'>;
  poller?: PollWhileVisible;
};

export const NEEDS_YOU_POLL_INTERVAL_MS = 30_000;
const COUNT_PROBE_LIMIT = 100;

/// Shared "Needs you" source: the count of pending approvals in the selected
/// Space. Feeds the sidebar Inbox badge today and the Home NeedsYou block
/// later. Polls every 30s via pollWhileVisible (pauses while the tab is
/// hidden; one immediate tick on return).
export class NeedsYouStore {
  readonly api: Pick<ApprovalsApi, 'listApprovals'>;
  readonly poller: PollWhileVisible;

  count = $state(0);
  hasMore = $state(false);
  status = $state<NeedsYouStoreStatus>('idle');
  error = $state<string | null>(null);
  params = $state<ApprovalListParams>({});

  private stopPolling: PollStop | null = null;
  private requestVersion = 0;

  constructor(options: NeedsYouStoreOptions) {
    this.api = options.api;
    this.poller = options.poller ?? pollWhileVisible;
  }

  /// Zero means hidden: the badge only shows when the user is needed.
  get showBadge(): boolean {
    return this.count > 0;
  }

  get displayCount(): string {
    if (this.hasMore || this.count > 99) return '99+';
    return String(this.count);
  }

  async refresh(params: ApprovalListParams = this.params): Promise<number> {
    const version = ++this.requestVersion;
    this.params = { ...params };
    if (this.status === 'idle') this.status = 'loading';
    try {
      const page = await this.api.listApprovals({
        ...this.params,
        status: 'pending',
        limit: COUNT_PROBE_LIMIT,
      });
      if (version !== this.requestVersion) return this.count;
      this.count = page.approvals.length;
      this.hasMore = page.hasMore;
      this.status = 'ready';
      this.error = null;
      return this.count;
    } catch (error) {
      if (version === this.requestVersion) {
        this.status = 'error';
        this.error = error instanceof Error ? error.message : String(error);
      }
      throw error;
    }
  }

  startPolling(params: ApprovalListParams = this.params, intervalMs = NEEDS_YOU_POLL_INTERVAL_MS): PollStop {
    this.stop();
    this.params = { ...params };
    this.status = 'loading';
    void this.refreshForPolling();
    this.stopPolling = this.poller(() => this.refreshForPolling(), intervalMs);
    return () => this.stop();
  }

  stop(): void {
    if (!this.stopPolling) return;
    this.stopPolling();
    this.stopPolling = null;
  }

  reset(): void {
    this.requestVersion += 1;
    this.count = 0;
    this.hasMore = false;
    this.status = 'idle';
    this.error = null;
  }

  private async refreshForPolling(): Promise<void> {
    try {
      await this.refresh(this.params);
    } catch {
      // Poll ticks are best-effort; refresh() already recorded status/error.
    }
  }
}

export const needsYouStore = new NeedsYouStore({ api: approvalsApi });
