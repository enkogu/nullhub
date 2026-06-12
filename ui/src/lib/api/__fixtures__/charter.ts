import type { Charter } from '$lib/api/charter';
import { jsonFixture, type ApiFixtureRequest, type ApiFixtureResponse, type ApiFixtureRoute } from './backend';

export const reservedCharterMarker = '<!-- NULLHUB:CHARTER_FIELD:mission:BEGIN -->';

export const fixtureCharter: Charter = {
  spaceId: 'ops',
  stage: 'alpha',
  mission: 'Keep operator work visible, reviewed, and moving.',
  autonomyBounds: 'Ask before destructive work.\nUse configured provider refs only.',
  autonomyDefaults: 'T1 until a policy order raises the tier.',
  metrics: 'open approvals\ncycle time\nweekly spend',
  docPath: 'charter.md',
};

export type CharterFixtureState = {
  charters: Record<string, Charter>;
};

export function createCharterFixtureState(initial: Charter[] = [fixtureCharter]): CharterFixtureState {
  return {
    charters: Object.fromEntries(initial.map((charter) => [charter.spaceId, { ...charter }])),
  };
}

function requireSpace(request: ApiFixtureRequest): string | null {
  return request.url.searchParams.get('space');
}

function bodyObject(request: ApiFixtureRequest): Record<string, unknown> {
  return request.bodyJson && typeof request.bodyJson === 'object'
    ? (request.bodyJson as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function defaultCharter(spaceId: string): Charter {
  return {
    spaceId,
    stage: 'draft',
    mission: '',
    autonomyBounds: '',
    autonomyDefaults: 'T1',
    metrics: '',
    docPath: 'charter.md',
  };
}

function wireCharter(charter: Charter) {
  return {
    space_id: charter.spaceId,
    stage: charter.stage,
    mission: charter.mission,
    autonomy_bounds: charter.autonomyBounds,
    autonomy_defaults: charter.autonomyDefaults,
    metrics: charter.metrics,
    doc_path: charter.docPath,
  };
}

function hasReservedMarker(value: string): boolean {
  return value.includes('NULLHUB:CHARTER_FIELD:');
}

function markerCollisionResponse(): ApiFixtureResponse {
  return jsonFixture(
    { error: 'charter Markdown fields must not contain reserved NULLHUB charter markers' },
    { status: 400 },
  );
}

export function createCharterFixtureRoutes(
  state: CharterFixtureState = createCharterFixtureState(),
): ApiFixtureRoute[] {
  return [
    {
      method: 'GET',
      path: '/api/charter',
      handler: (request) => {
        const space = requireSpace(request);
        if (!space) return jsonFixture({ error: 'space query is required' }, { status: 400 });
        return jsonFixture(wireCharter(state.charters[space] ?? defaultCharter(space)));
      },
    },
    {
      method: 'PUT',
      path: '/api/charter',
      handler: (request) => {
        const space = requireSpace(request);
        if (!space) return jsonFixture({ error: 'space query is required' }, { status: 400 });

        const body = bodyObject(request);
        const stage = stringValue(body.stage).trim();
        if (!stage) return jsonFixture({ error: 'stage is required' }, { status: 400 });

        const autonomyDefaults = body.autonomy_defaults ?? body.autonomyDefaults ?? body.defaults;
        const next = {
          spaceId: space,
          stage,
          mission: stringValue(body.mission),
          autonomyBounds: stringValue(body.autonomy_bounds ?? body.autonomyBounds),
          autonomyDefaults: stringValue(autonomyDefaults || 'T1'),
          metrics: stringValue(body.metrics),
          docPath: 'charter.md',
        };

        if (
          hasReservedMarker(next.mission) ||
          hasReservedMarker(next.autonomyBounds) ||
          hasReservedMarker(next.autonomyDefaults) ||
          hasReservedMarker(next.metrics)
        ) {
          return markerCollisionResponse();
        }

        state.charters[space] = next;
        return jsonFixture(wireCharter(next));
      },
    },
  ];
}
