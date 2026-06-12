import { describe, expect, test } from 'vitest';
import type { Approval } from '$lib/api/client';
import {
  INBOX_QUEUE_ALL,
  feedbackError,
  filterInboxApprovals,
  inboxQueueTabs,
  isLikelyDiff,
  parseUnifiedDiff,
} from './inbox';

function approval(overrides: Partial<Approval>): Approval {
  return {
    id: 1,
    spaceId: 'ops',
    kind: 'signature',
    queue: '',
    targetRef: '',
    title: 'Approval',
    summary: '',
    status: 'pending',
    feedback: '',
    createdAtMs: 1000,
    decidedAtMs: 0,
    ...overrides,
  };
}

describe('inboxQueueTabs', () => {
  test('builds All first with pending counts per queue', () => {
    const tabs = inboxQueueTabs([
      approval({ id: 1, queue: 'deploys' }),
      approval({ id: 2, queue: 'deploys' }),
      approval({ id: 3, queue: 'intake' }),
      approval({ id: 4, queue: 'deploys', status: 'approved' }),
      approval({ id: 5, queue: '' }),
    ]);

    expect(tabs).toEqual([
      { queue: INBOX_QUEUE_ALL, label: 'All', count: 4 },
      { queue: '', label: 'General', count: 1 },
      { queue: 'deploys', label: 'deploys', count: 2 },
      { queue: 'intake', label: 'intake', count: 1 },
    ]);
  });
});

describe('filterInboxApprovals', () => {
  const approvals = [
    approval({ id: 1, queue: 'deploys' }),
    approval({ id: 2, queue: 'intake' }),
    approval({ id: 3, queue: 'deploys', status: 'pushed_back' }),
  ];

  test('shows pending items for the selected queue', () => {
    expect(filterInboxApprovals(approvals, { queue: 'deploys' }).map((a) => a.id)).toEqual([1]);
    expect(filterInboxApprovals(approvals).map((a) => a.id)).toEqual([1, 2]);
  });

  test('history mode shows only decided items', () => {
    expect(filterInboxApprovals(approvals, { history: true }).map((a) => a.id)).toEqual([3]);
  });
});

describe('feedbackError', () => {
  test('requires at least 10 characters of feedback', () => {
    expect(feedbackError('')).toMatch(/required/);
    expect(feedbackError('   ')).toMatch(/required/);
    expect(feedbackError('too short')).toMatch(/at least 10/);
    expect(feedbackError('Needs a rollback plan.')).toBeNull();
  });
});

describe('diff preview helpers', () => {
  const diff = [
    'diff --git a/src/app.ts b/src/app.ts',
    'index 123..456 100644',
    '--- a/src/app.ts',
    '+++ b/src/app.ts',
    '@@ -1,3 +1,3 @@',
    ' const a = 1;',
    '-const b = 2;',
    '+const b = 3;',
  ].join('\n');

  test('isLikelyDiff detects unified diffs but not markdown', () => {
    expect(isLikelyDiff(diff)).toBe(true);
    expect(isLikelyDiff('## Deploy plan\n\n- roll out v2')).toBe(false);
  });

  test('parseUnifiedDiff produces DiffViewer files with line types', () => {
    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/app.ts');
    expect(files[0].additions).toBe(1);
    expect(files[0].deletions).toBe(1);
    expect(files[0].lines.map((line) => line.type)).toEqual(['hunk', 'context', 'remove', 'add']);
    expect(files[0].lines[3]).toMatchObject({ type: 'add', content: 'const b = 3;', newLine: 2 });
  });
});
