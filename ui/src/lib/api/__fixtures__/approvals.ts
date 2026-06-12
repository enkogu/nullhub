import { jsonFixture, type ApiFixtureRoute } from './backend';

export const fixtureApprovals = [
  {
    id: 3,
    space_id: 'ops',
    kind: 'failure',
    queue: 'runs',
    target_ref: 'run:run-9',
    title: 'Nightly digest run failed',
    summary: 'The run exited with a provider timeout after 3 retries.',
    status: 'pending',
    feedback: '',
    created_at_ms: 3000,
    decided_at_ms: 0,
  },
  {
    id: 2,
    space_id: 'ops',
    kind: 'question',
    queue: 'intake',
    target_ref: 'run:run-7',
    title: 'Which tone should the newsletter use?',
    summary: 'The drafting agent is waiting on a tone choice before continuing.',
    status: 'pending',
    feedback: '',
    created_at_ms: 2000,
    decided_at_ms: 0,
  },
  {
    id: 1,
    space_id: 'ops',
    kind: 'signature',
    queue: 'deploys',
    target_ref: 'order:42',
    title: 'Sign the v2 deploy plan',
    summary: '## Deploy plan\n\n- roll out v2\n- watch error rate',
    status: 'pending',
    feedback: '',
    created_at_ms: 1000,
    decided_at_ms: 0,
  },
] as const;

export function approvalsFixtureRoutes(): ApiFixtureRoute[] {
  return [
    {
      method: 'GET',
      path: (request) => request.url.pathname === '/api/approvals',
      handler: (request) =>
        jsonFixture({
          approvals: fixtureApprovals.filter((approval) => {
            const status = request.url.searchParams.get('status');
            const kind = request.url.searchParams.get('kind');
            const queue = request.url.searchParams.get('queue');
            return (
              request.url.searchParams.get('space') === approval.space_id &&
              (!status || status === approval.status) &&
              (!kind || kind === approval.kind) &&
              (!queue || queue === approval.queue)
            );
          }),
          has_more: false,
          next_cursor: null,
        }),
    },
    {
      method: 'POST',
      path: (request) => /^\/api\/approvals\/\d+\/decide$/.test(request.url.pathname),
      handler: (request) => {
        const id = Number(request.url.pathname.split('/')[3]);
        const approval = fixtureApprovals.find((entry) => entry.id === id);
        if (!approval) return jsonFixture({ error: 'not found' }, { status: 404 });
        const body =
          request.bodyJson && typeof request.bodyJson === 'object'
            ? (request.bodyJson as Record<string, unknown>)
            : {};
        const decision = String(body.decision ?? '');
        const feedback = String(body.feedback ?? '');
        if (decision === 'pushed_back' && !feedback.trim()) {
          return jsonFixture({ error: 'feedback is required when pushing back' }, { status: 422 });
        }
        return jsonFixture({
          ...approval,
          status: decision,
          feedback,
          decided_at_ms: 9000,
        });
      },
    },
    {
      method: 'POST',
      path: (request) => request.url.pathname === '/api/approvals',
      handler: (request) => {
        const body =
          request.bodyJson && typeof request.bodyJson === 'object'
            ? (request.bodyJson as Record<string, unknown>)
            : {};
        return jsonFixture(
          {
            id: 4,
            space_id: request.url.searchParams.get('space'),
            kind: body.kind ?? '',
            queue: body.queue ?? '',
            target_ref: body.target_ref ?? '',
            title: body.title ?? '',
            summary: body.summary ?? '',
            status: 'pending',
            feedback: '',
            created_at_ms: body.created_at_ms ?? 4000,
            decided_at_ms: 0,
          },
          { status: 201 },
        );
      },
    },
  ];
}
