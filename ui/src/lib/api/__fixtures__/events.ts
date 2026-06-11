import { jsonFixture, type ApiFixtureRoute } from './backend';

export const fixtureEvents = [
  {
    id: 2,
    space_id: 'ops',
    type: 'work.finished',
    source: 'dispatcher',
    subject_type: 'run',
    subject_id: 'run-2',
    title: 'Run finished',
    summary: 'The run completed.',
    severity: 'success',
    evidence_ref: 'artifact://run-2',
    created_at_ms: 2000,
    payload: { duration_ms: 1200 },
  },
  {
    id: 1,
    space_id: 'ops',
    type: 'work.started',
    source: 'dispatcher',
    subject_type: 'run',
    subject_id: 'run-1',
    title: 'Run started',
    summary: 'The run started.',
    severity: 'info',
    evidence_ref: '',
    created_at_ms: 1000,
    payload: { queued: false },
  },
] as const;

export function eventsFixtureRoutes(): ApiFixtureRoute[] {
  return [
    {
      method: 'GET',
      path: (request) => request.url.pathname === '/api/events',
      handler: (request) =>
        jsonFixture({
          events: fixtureEvents.filter((event) => {
            const type = request.url.searchParams.get('type');
            return request.url.searchParams.get('space') === event.space_id && (!type || type === event.type);
          }),
          has_more: true,
          next_cursor: '1',
        }),
    },
    {
      method: 'POST',
      path: (request) => request.url.pathname === '/api/events',
      handler: (request) => {
        const body =
          request.bodyJson && typeof request.bodyJson === 'object'
            ? (request.bodyJson as Record<string, unknown>)
            : {};
        return jsonFixture(
          {
            id: 3,
            space_id: request.url.searchParams.get('space'),
            ...body,
            subject_type: body.subject_type ?? '',
            subject_id: body.subject_id ?? '',
            summary: body.summary ?? '',
            severity: body.severity ?? 'info',
            evidence_ref: body.evidence_ref ?? '',
            created_at_ms: body.created_at_ms ?? 3000,
            payload: body.payload ?? {},
          },
          { status: 201 },
        );
      },
    },
  ];
}
