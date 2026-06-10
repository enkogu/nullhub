import statusFixture from './status.json';
import { jsonFixture, type ApiFixtureRoute } from './backend';

export { statusFixture };

export const coreApiFixtureRoutes: ApiFixtureRoute[] = [
  {
    method: 'GET',
    path: '/api/status',
    handler: () => jsonFixture(statusFixture),
  },
];
