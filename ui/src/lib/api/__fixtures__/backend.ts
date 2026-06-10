import { vi } from 'vitest';

export type ApiFixtureRequest = {
  method: string;
  url: URL;
  path: string;
  headers: Headers;
  bodyText: string;
  bodyJson: unknown;
};

export type ApiFixtureResponse =
  | Response
  | {
      status?: number;
      headers?: HeadersInit;
      body?: unknown;
    };

export type ApiFixtureRoute = {
  method?: string;
  path: string | RegExp | ((request: ApiFixtureRequest) => boolean);
  handler: (request: ApiFixtureRequest) => ApiFixtureResponse | Promise<ApiFixtureResponse>;
};

export type InstalledApiFixture = {
  requests: ApiFixtureRequest[];
  fetch: ReturnType<typeof vi.fn>;
  restore: () => void;
};

const FIXTURE_ORIGIN = 'http://nullhub-fixture.local';

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request;
}

function normalizeMethod(method?: string): string {
  return (method || 'GET').toUpperCase();
}

function requestPath(url: URL): string {
  return `${url.pathname}${url.search}`;
}

async function requestBody(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
  if (init?.body !== undefined && init.body !== null) return String(init.body);
  if (isRequest(input)) return input.clone().text().catch(() => '');
  return '';
}

async function normalizeRequest(input: RequestInfo | URL, init?: RequestInit): Promise<ApiFixtureRequest> {
  const rawUrl = isRequest(input) ? input.url : String(input);
  const url = new URL(rawUrl, FIXTURE_ORIGIN);
  const bodyText = await requestBody(input, init);
  let bodyJson: unknown = undefined;
  if (bodyText) {
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = undefined;
    }
  }

  return {
    method: normalizeMethod(init?.method ?? (isRequest(input) ? input.method : undefined)),
    url,
    path: requestPath(url),
    headers: new Headers(init?.headers ?? (isRequest(input) ? input.headers : undefined)),
    bodyText,
    bodyJson,
  };
}

function routeMatches(route: ApiFixtureRoute, request: ApiFixtureRequest): boolean {
  if (route.method && normalizeMethod(route.method) !== request.method) return false;
  if (typeof route.path === 'string') {
    return route.path.includes('?') ? request.path === route.path : request.url.pathname === route.path;
  }
  if (route.path instanceof RegExp) return route.path.test(request.path);
  return route.path(request);
}

function toResponse(response: ApiFixtureResponse): Response {
  if (response instanceof Response) return response;

  const headers = new Headers(response.headers);
  const hasBody = response.body !== undefined;
  if (hasBody && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  return new Response(
    hasBody
      ? typeof response.body === 'string'
        ? response.body
        : JSON.stringify(response.body)
      : null,
    {
      status: response.status ?? 200,
      headers,
    },
  );
}

export function jsonFixture(body: unknown, init: { status?: number; headers?: HeadersInit } = {}): ApiFixtureResponse {
  return {
    status: init.status ?? 200,
    headers: init.headers,
    body,
  };
}

export function installApiFixture(routes: ApiFixtureRoute[]): InstalledApiFixture {
  const originalFetch = globalThis.fetch;
  const requests: ApiFixtureRequest[] = [];
  const fixtureFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = await normalizeRequest(input, init);
    requests.push(request);

    const route = routes.find((candidate) => routeMatches(candidate, request));
    if (!route) {
      return toResponse(
        jsonFixture(
          {
            error: 'No API fixture route matched.',
            method: request.method,
            path: request.path,
          },
          { status: 404 },
        ),
      );
    }

    return toResponse(await route.handler(request));
  });

  globalThis.fetch = fixtureFetch as unknown as typeof fetch;

  return {
    requests,
    fetch: fixtureFetch,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
