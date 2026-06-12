import {
  approvalsApi,
  type Approval,
  type ApprovalDecideInput,
  type ApprovalListPage,
  type ApprovalListParams,
  type ApprovalsApi,
} from '$lib/api/client';
import { pollWhileVisible, type PollStop } from '$lib/poll';

export type ApprovalsStoreStatus = 'idle' | 'loading' | 'ready' | 'error';
type PollWhileVisible = (tick: () => void | Promise<void>, intervalMs: number) => PollStop;

type ApprovalsStoreOptions = {
  api: ApprovalsApi;
  poller?: PollWhileVisible;
};

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ApprovalsStore {
  readonly api: ApprovalsApi;
  readonly poller: PollWhileVisible;

  approvals = $state<Approval[]>([]);
  status = $state<ApprovalsStoreStatus>('idle');
  error = $state<string | null>(null);
  hasMore = $state(false);
  nextCursor = $state<string | null>(null);
  params = $state<ApprovalListParams>({});

  private stopPolling: PollStop | null = null;
  private requestVersion = 0;

  constructor(options: ApprovalsStoreOptions) {
    this.api = options.api;
    this.poller = options.poller ?? pollWhileVisible;
  }

  async refresh(params: ApprovalListParams = this.params): Promise<ApprovalListPage> {
    const version = this.nextRequestVersion();
    this.params = { ...params };
    try {
      const page = await this.api.listApprovals(this.params);
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

  /// Decide on the server, then refresh so decided items move into history.
  async decide(approval: Approval, input: ApprovalDecideInput): Promise<Approval> {
    const decided = await this.api.decideApproval(approval.id, {
      ...input,
      spaceId: input.spaceId === undefined ? this.params.spaceId : input.spaceId,
    });
    await this.refresh().catch(() => undefined);
    return decided;
  }

  startPolling(params: ApprovalListParams = this.params, intervalMs = 5000): PollStop {
    this.stop();
    this.reset(params, 'loading');
    void this.refreshForPolling();
    this.stopPolling = this.poller(() => this.refreshForPolling(), intervalMs);
    return () => this.stop();
  }

  reset(params: ApprovalListParams = this.params, status: ApprovalsStoreStatus = 'idle'): void {
    this.requestVersion += 1;
    this.params = { ...params };
    this.approvals = [];
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

  private applyPage(page: ApprovalListPage): void {
    this.approvals = page.approvals;
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

export const approvalsStore = new ApprovalsStore({ api: approvalsApi });
