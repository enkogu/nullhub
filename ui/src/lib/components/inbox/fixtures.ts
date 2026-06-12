import type { Approval } from '$lib/api/client';

export const inboxFixtureNowMs = 1_780_000_000_000;

export function fixtureApproval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: 1,
    spaceId: 'ops',
    kind: 'signature',
    queue: 'deploys',
    targetRef: 'order:42',
    title: 'Sign the v2 deploy plan',
    summary: '## Deploy plan\n\n- roll out v2\n- watch the error rate for 30 minutes',
    status: 'pending',
    feedback: '',
    createdAtMs: inboxFixtureNowMs - 12 * 60_000,
    decidedAtMs: 0,
    ...overrides,
  };
}

export const signatureApproval = fixtureApproval();

export const diffSignatureApproval = fixtureApproval({
  id: 4,
  title: 'Sign the config change',
  targetRef: 'order:43',
  summary: [
    'diff --git a/config.json b/config.json',
    '--- a/config.json',
    '+++ b/config.json',
    '@@ -1,3 +1,3 @@',
    ' {',
    '-  "retries": 1',
    '+  "retries": 3',
  ].join('\n'),
});

export const questionApproval = fixtureApproval({
  id: 2,
  kind: 'question',
  queue: 'intake',
  targetRef: 'run:run-7',
  title: 'Which tone should the newsletter use?',
  summary: 'The drafting agent is waiting on a tone choice before continuing.',
  createdAtMs: inboxFixtureNowMs - 35 * 60_000,
});

export const failureApproval = fixtureApproval({
  id: 3,
  kind: 'failure',
  queue: 'runs',
  targetRef: 'run:run-9',
  title: 'Nightly digest run failed',
  summary: 'The run exited with a provider timeout after 3 retries.',
  createdAtMs: inboxFixtureNowMs - 2 * 60 * 60_000,
});

export const decidedApproval = fixtureApproval({
  id: 5,
  title: 'Sign the v1 deploy plan',
  status: 'pushed_back',
  feedback: 'Needs a rollback plan before signing.',
  decidedAtMs: inboxFixtureNowMs - 60 * 60_000,
});

export const inboxFixtureApprovals: Approval[] = [
  failureApproval,
  questionApproval,
  signatureApproval,
  decidedApproval,
];
