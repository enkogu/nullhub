import type { Approval, ApprovalDecision } from '$lib/api/client';
import type { DiffFile, DiffLine, DiffLineType } from '$lib/components/DiffViewer.svelte';

export const INBOX_QUEUE_ALL = '__all__';
export const MIN_FEEDBACK_LENGTH = 10;

export type InboxQueueTab = {
  queue: string;
  label: string;
  count: number;
};

export type InboxDecisionInput = {
  decision: ApprovalDecision;
  feedback?: string;
};

export function isPendingApproval(approval: Approval): boolean {
  return approval.status === 'pending';
}

/// Queue tabs derived from the loaded approvals: "All" first, then each named
/// queue (unnamed approvals fall under "General"), with pending counts.
export function inboxQueueTabs(approvals: Approval[]): InboxQueueTab[] {
  const counts = new Map<string, number>();
  let pendingTotal = 0;
  for (const approval of approvals) {
    if (!isPendingApproval(approval)) continue;
    pendingTotal += 1;
    const queue = approval.queue || '';
    counts.set(queue, (counts.get(queue) ?? 0) + 1);
  }
  const tabs: InboxQueueTab[] = [{ queue: INBOX_QUEUE_ALL, label: 'All', count: pendingTotal }];
  for (const queue of [...counts.keys()].sort()) {
    tabs.push({ queue, label: queue || 'General', count: counts.get(queue) ?? 0 });
  }
  return tabs;
}

export function filterInboxApprovals(
  approvals: Approval[],
  options: { queue?: string; history?: boolean } = {},
): Approval[] {
  const queue = options.queue ?? INBOX_QUEUE_ALL;
  return approvals.filter((approval) => {
    if (options.history ? isPendingApproval(approval) : !isPendingApproval(approval)) return false;
    if (queue !== INBOX_QUEUE_ALL && (approval.queue || '') !== queue) return false;
    return true;
  });
}

export function decisionLabel(decision: ApprovalDecision): string {
  if (decision === 'approved') return 'Approved';
  if (decision === 'pushed_back') return 'Returned for rework';
  return 'Rejected';
}

export function statusLabel(status: string): string {
  if (status === 'pending') return 'Pending';
  if (status === 'approved') return 'Approved';
  if (status === 'pushed_back') return 'Returned';
  if (status === 'rejected') return 'Rejected';
  return status;
}

/// Feedback validation for the FeedbackDialog: required, >= 10 chars.
export function feedbackError(feedback: string): string | null {
  const trimmed = feedback.trim();
  if (!trimmed) return 'Feedback is required to return work.';
  if (trimmed.length < MIN_FEEDBACK_LENGTH) {
    return `Feedback must be at least ${MIN_FEEDBACK_LENGTH} characters.`;
  }
  return null;
}

export function formatInboxTime(createdAtMs: number, nowMs = Date.now()): string {
  if (!createdAtMs) return 'Time unavailable';
  const elapsedMs = Math.max(0, nowMs - createdAtMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsedMs < minute) return 'Just now';
  if (elapsedMs < hour) return `${Math.floor(elapsedMs / minute)}m ago`;
  if (elapsedMs < day) return `${Math.floor(elapsedMs / hour)}h ago`;
  if (elapsedMs < 7 * day) return `${Math.floor(elapsedMs / day)}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(createdAtMs),
  );
}

export function isLikelyDiff(text: string): boolean {
  if (/^diff --git /m.test(text)) return true;
  return /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(text) && /^[+-]/m.test(text);
}

/// Minimal unified-diff parser feeding DiffViewer. Good enough for inline
/// approval previews; anything unparseable falls back to Markdown rendering.
export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;

  const pushFile = (path: string) => {
    current = { path, additions: 0, deletions: 0, lines: [] };
    files.push(current);
  };

  for (const raw of text.split('\n')) {
    const gitHeader = raw.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (gitHeader) {
      pushFile(gitHeader[2]);
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const path = raw.slice(4).replace(/^b\//, '').trim();
      if (!current || current.lines.length > 0) pushFile(path);
      else if (path && path !== '/dev/null') current.path = path;
      continue;
    }
    if (raw.startsWith('--- ') || raw.startsWith('index ')) continue;
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      if (!current) pushFile('(unknown file)');
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      current!.lines.push({ type: 'hunk', content: raw });
      continue;
    }
    if (!current) continue;
    let type: DiffLineType = 'context';
    if (raw.startsWith('+')) type = 'add';
    else if (raw.startsWith('-')) type = 'remove';
    const hasMarker = raw.startsWith('+') || raw.startsWith('-') || raw.startsWith(' ');
    const line: DiffLine = { type, content: hasMarker ? raw.slice(1) : raw };
    if (type !== 'add') line.oldLine = oldLine++;
    if (type !== 'remove') line.newLine = newLine++;
    if (type === 'add') current.additions = (current.additions ?? 0) + 1;
    if (type === 'remove') current.deletions = (current.deletions ?? 0) + 1;
    current.lines.push(line);
  }

  return files.filter((file) => file.lines.some((line) => line.type !== 'hunk'));
}
