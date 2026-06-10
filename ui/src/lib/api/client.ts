import { createNullBoilerApi } from '$lib/api/nullboiler';
import { createEventsApi } from '$lib/api/events';
import { createMissionControlApi } from '$lib/api/missionControl';
import { createNullTicketsApi, createNullTicketsStoreApi } from '$lib/api/nulltickets';
import { SPACE_QUERY_PARAM, createSpacesApi, selectedSpaceFromEnvironment } from '$lib/api/spaces';
import { componentApiPath, encodePathSegment, instanceApiPath } from '$lib/nullstack/path';
import { normalizeMojibakeText, normalizeMojibakeValue } from '$lib/textEncoding';

let resolvedBase: string | null = null;
const inflightGets = new Map<string, Promise<any>>();
const recentGets = new Map<string, { value: any; expiresAt: number }>();
const GET_DEDUPE_TTL_MS = 500;
const RECENT_GET_MAX_ENTRIES = 128;
let getCacheGeneration = 0;

function pruneRecentGets(now = performance.now()) {
  for (const [key, cached] of recentGets) {
    if (cached.expiresAt <= now) recentGets.delete(key);
  }
  while (recentGets.size > RECENT_GET_MAX_ENTRIES) {
    const oldestKey = recentGets.keys().next().value;
    if (!oldestKey) break;
    recentGets.delete(oldestKey);
  }
}

function rememberRecentGet(key: string, value: any) {
  const now = performance.now();
  recentGets.delete(key);
  recentGets.set(key, { value, expiresAt: now + GET_DEDUPE_TTL_MS });
  pruneRecentGets(now);
}

function invalidateGetCaches() {
  getCacheGeneration += 1;
  inflightGets.clear();
  recentGets.clear();
}

// Circuit breaker: when the backend is down, polling pages would otherwise
// stack up slow timed-out requests and exhaust the browser's per-origin
// connection pool, freezing navigation. After a few consecutive transport
// failures, GETs fail fast for a cooldown window instead.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 5_000;
const BREAKER_MAX_COOLDOWN_MS = 30_000;
let breakerConsecutiveFailures = 0;
let breakerOpenUntil = 0;
let breakerCooldownMs = BREAKER_COOLDOWN_MS;
let breakerHalfOpenProbe = false;

function isTransportFailure(error: ApiRequestError): boolean {
  const status = error.status ?? 0;
  return status === 0 || status === 502 || status === 503 || status === 504;
}

function noteRequestSuccess() {
  breakerConsecutiveFailures = 0;
  breakerOpenUntil = 0;
  breakerCooldownMs = BREAKER_COOLDOWN_MS;
  breakerHalfOpenProbe = false;
}

function noteRequestFailure(error: ApiRequestError) {
  breakerHalfOpenProbe = false;
  if (!isTransportFailure(error)) return;
  breakerConsecutiveFailures += 1;
  if (breakerConsecutiveFailures >= BREAKER_THRESHOLD) {
    breakerOpenUntil = performance.now() + breakerCooldownMs;
    breakerCooldownMs = Math.min(breakerCooldownMs * 2, BREAKER_MAX_COOLDOWN_MS);
  }
}

/// Returns true when a GET should be rejected immediately. After the cooldown
/// elapses, exactly one caller is let through as a half-open probe; everyone
/// else keeps failing fast until that probe settles.
function breakerBlocksGet(): boolean {
  if (breakerConsecutiveFailures < BREAKER_THRESHOLD) return false;
  if (performance.now() < breakerOpenUntil) return true;
  if (breakerHalfOpenProbe) return true;
  breakerHalfOpenProbe = true;
  return false;
}

function breakerError(): ApiRequestError {
  const error = new Error('NullHub backend unreachable; retrying shortly.') as ApiRequestError;
  error.status = 0;
  error.body = { circuitOpen: true };
  return error;
}

function prefersDirectApiBase(): boolean {
  if (typeof window === 'undefined') return true;
  if (import.meta.env.DEV) return true;
  const port = window.location.port;
  const host = window.location.hostname;
  return (
    port === '19800' ||
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host === '::1' ||
    host === 'nullhub.localhost' ||
    host === 'nullhub.local'
  );
}

function apiBases(): string[] {
  if (resolvedBase) return [resolvedBase];
  if (typeof window !== 'undefined') {
    return prefersDirectApiBase() ? ['/api', '/nullhub-api'] : ['/nullhub-api', '/api'];
  }
  return ['/api'];
}

function withQuery(path: string, params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export { encodePathSegment };
export type {
  EventCreateInput,
  EventListPage,
  EventListParams,
  EventsApi,
  EventSeverity,
  NullHubEvent,
} from '$lib/api/events';
export type {
  Space,
  SpaceCreateInput,
  SpaceScopedOptions,
  SpaceSelection,
  SpaceUpdateInput,
  SpacesApi,
} from '$lib/api/spaces';
export type {
  MissionControlAgent,
  MissionControlComponentMapping,
  MissionControlControls,
  MissionControlEvent,
  MissionControlFailure,
  MissionControlGraphEdge,
  MissionControlGraphNode,
  MissionControlNullWatchMapping,
  MissionControlPhase,
  MissionControlRecovery,
  MissionControlReplayArtifact,
  MissionControlReplayList,
  MissionControlReplayRecord,
  MissionControlReplaySaveResult,
  MissionControlState,
  MissionControlStatus,
  MissionControlTelemetry,
  MissionControlTraceRef,
  MissionControlWorkflowEvidence,
  MissionControlWorkflowEvidenceCheckpoint,
  MissionControlWorkflowEvidenceRun,
  MissionControlWorkflowEvidenceStatus,
  MissionControlWorkflowMapping,
} from '$lib/api/missionControl';

export type LogSource = 'instance' | 'nullhub';
export type ReportOption = { value: string; label: string };
export type ReportTypeOption = ReportOption & { labels: string[] };
export type ReportRepoOption = ReportOption & { repo: string };
export type McpTransport = 'stdio' | 'http' | 'unknown';
export type McpServerSummary = {
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  args_count?: number;
  url?: string | null;
  env_keys?: string[];
  header_names?: string[];
  timeout_ms?: number;
  tool_count?: number | null;
  status?: string;
  last_error?: string | null;
};
export type McpServerDraft = {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  replace_env?: boolean;
  replace_headers?: boolean;
  timeout_ms?: number;
};
export type McpMutationResult = {
  action: string;
  changed: boolean;
  applied?: boolean;
  requires_reload?: boolean;
  requires_restart?: boolean;
  server_name?: string;
  message?: string;
  valid?: boolean;
};
export type CronJobCreateRequest = {
  expression?: string;
  delay?: string;
  command?: string;
  prompt?: string;
  model?: string;
  session_target?: string;
  announce?: boolean;
  delivery_channel?: string;
  delivery_account_id?: string;
  delivery_to?: string;
};
export type CronJobUpdateRequest = {
  expression?: string;
  command?: string;
  prompt?: string;
  model?: string;
  enabled?: boolean;
  session_target?: string;
};
export type AgentInvokeRequest = {
  message: string;
  session_key?: string;
  provider?: string;
  model?: string;
  temperature?: string;
  agent?: string;
};
export type AgentInvokeResponse = {
  session?: string;
  session_key?: string;
  response?: string;
  turn_count?: number;
  [key: string]: unknown;
};
export type AgentSessionSummary = {
  session_key: string;
  created_at?: string;
  last_active?: string;
  turn_count?: number;
  turn_running?: boolean;
};
type InstanceStartOptions = {
  launch_mode?: string;
  verbose?: boolean;
};
type InstanceDeleteOptions = {
  force?: boolean;
};
type NullWatchTarget = {
  watch?: string;
};
export type ImportInstanceRequest = {
  path?: string;
  name?: string;
};
export type StandaloneInfo = {
  standalone: boolean;
  standalone_path?: string;
  already_imported?: boolean;
};
export type ApiRequestError = Error & {
  status?: number;
  body?: any;
};
type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
  spaceScoped?: boolean;
};

const ADMIN_READ_TIMEOUT_MS = 10_000;
const HISTORY_READ_TIMEOUT_MS = 60_000;
const ADMIN_MUTATION_TIMEOUT_MS = 120_000;
const ADMIN_INSTALL_TIMEOUT_MS = 600_000;
const mojibakeResponsePattern = /[ÐÑÃÂâðŸ�]|\\u00(?:c3|c2|d0|d1|f0|f1)/i;

function requestTimeoutMs(options?: ApiRequestInit): number {
  if (options?.timeoutMs && options.timeoutMs > 0) return options.timeoutMs;
  const method = (options?.method || 'GET').toUpperCase();
  return method === 'GET' ? 10000 : 60000;
}

function normalizeApiJson<T>(rawText: string, value: T): T {
  return mojibakeResponsePattern.test(rawText) ? normalizeMojibakeValue(value) : value;
}

const SPACE_SCOPED_GET_PATHS = [
  /^\/instances(?:[/?#]|$)/,
  /^\/providers(?:[/?#]|$)/,
  /^\/channels(?:[/?#]|$)/,
  /^\/components\/[^/]+\/instances(?:[/?#]|$)/,
  /^\/components\/[^/]+\/instances\/[^/]+(?:[/?#]|$)/,
  /^\/nullboiler(?:[/?#]|$)/,
  /^\/nulltickets(?:[/?#]|$)/,
  /^\/mission-control(?:[/?#]|$)/,
];

function parseApiPath(path: string): URL {
  return new URL(path, 'http://nullhub.local');
}

function isSpaceScopedGetPath(path: string): boolean {
  const pathname = parseApiPath(path).pathname;
  return SPACE_SCOPED_GET_PATHS.some((pattern) => pattern.test(pathname));
}

function withSelectedSpace(path: string): string {
  const selectedSpaceId = selectedSpaceFromEnvironment();
  if (!selectedSpaceId) return path;
  const url = parseApiPath(path);
  if (url.searchParams.has(SPACE_QUERY_PARAM)) return path;
  url.searchParams.set(SPACE_QUERY_PARAM, selectedSpaceId);
  return `${url.pathname}${url.search}${url.hash}`;
}

function withSelectedSpaceBody<T extends Record<string, unknown>>(data: T): T & { space_id?: string } {
  const selectedSpaceId = selectedSpaceFromEnvironment();
  if (!selectedSpaceId || data.space_id !== undefined || data.space !== undefined) return data;
  return { ...data, space_id: selectedSpaceId };
}

function scopeRequestPath(path: string, method: string, options?: ApiRequestInit): string {
  if (!options?.spaceScoped && (method !== 'GET' || !isSpaceScopedGetPath(path))) return path;
  return withSelectedSpace(path);
}

async function requestFromBase<T>(base: string, path: string, options?: ApiRequestInit): Promise<T> {
  const timeoutMs = requestTimeoutMs(options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  options?.signal?.addEventListener('abort', abortFromCaller, { once: true });

  let res: Response;
  try {
    const { timeoutMs: _timeoutMs, signal: _signal, spaceScoped: _spaceScoped, ...fetchOptions } = options || {};
    res = await fetch(`${base}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (err) {
    const error = new Error(
      err instanceof DOMException && err.name === 'AbortError'
        ? `Request timed out after ${Math.round(timeoutMs / 1000)}s.`
        : (err as Error).message || 'API request failed.',
    ) as ApiRequestError;
    error.status = 0;
    throw error;
  } finally {
    clearTimeout(timeout);
    options?.signal?.removeEventListener('abort', abortFromCaller);
  }

  if (!res.ok) {
    const body = normalizeMojibakeValue(await res.json().catch(() => null));
    const errMsg =
      typeof body?.message === 'string'
        ? normalizeMojibakeText(body.message)
        : typeof body?.error === 'string'
          ? normalizeMojibakeText(body.error)
          : normalizeMojibakeText(body?.error?.message || `HTTP ${res.status}`);
    const error = new Error(errMsg) as ApiRequestError;
    error.status = res.status;
    error.body = body;
    throw error;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return normalizeApiJson(text, JSON.parse(text));
  } catch {
    const error = new Error(`Invalid JSON response from ${base}${path}`) as ApiRequestError;
    error.status = res.status;
    error.body = normalizeMojibakeText(text);
    throw error;
  }
}

async function request<T>(path: string, options?: ApiRequestInit): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const canDedupeGet = method === 'GET' && !options?.signal;
  const scopedPath = scopeRequestPath(path, method, options);
  const cacheKey = canDedupeGet ? scopedPath : '';
  if (canDedupeGet) {
    pruneRecentGets();
    const cached = recentGets.get(cacheKey);
    if (cached) {
      recentGets.delete(cacheKey);
      recentGets.set(cacheKey, cached);
      return cached.value as T;
    }
    const pending = inflightGets.get(cacheKey);
    if (pending) return pending as Promise<T>;
  }

  // Mutations always go through (they are user-initiated and double as
  // recovery probes); reads fail fast while the breaker is open.
  if (method === 'GET' && breakerBlocksGet()) {
    throw breakerError();
  }

  const doRequest = async () => {
    const bases = apiBases();
    let lastError: ApiRequestError | null = null;
    for (const base of bases) {
      try {
        const result = await requestFromBase<T>(base, scopedPath, options);
        resolvedBase = base;
        noteRequestSuccess();
        return result;
      } catch (error) {
        lastError = error as ApiRequestError;
        if (base === bases[bases.length - 1]) break;
        // Only fall back to the alternate base prefix when this prefix is
        // wrong for the deployment: 404/405 (unknown route) or HTTP 200 with
        // a non-JSON document (another app answered). Transport failures
        // (status 0/timeouts) mean the backend itself is down — retrying it
        // through another prefix would just double the wait.
        const status = lastError.status ?? 0;
        if (status !== 404 && status !== 405 && status !== 200) break;
      }
    }
    const finalError = lastError ?? (new Error('API request failed') as ApiRequestError);
    noteRequestFailure(finalError);
    throw finalError;
  };

  if (!canDedupeGet) {
    const value = await doRequest();
    if (method !== 'GET') invalidateGetCaches();
    return value;
  }

  const requestGeneration = getCacheGeneration;
  const pending = doRequest().then((value) => {
    if (requestGeneration === getCacheGeneration) {
      rememberRecentGet(cacheKey, value);
    }
    return value;
  }).finally(() => {
    if (inflightGets.get(cacheKey) === pending) {
      inflightGets.delete(cacheKey);
    }
  });
  inflightGets.set(cacheKey, pending);
  return pending;
}

function pocketBaseAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (typeof localStorage === 'undefined') return headers;
  try {
    const stored = JSON.parse(localStorage.getItem('pocketbase_auth') || '{}');
    if (stored?.token) headers.Authorization = `Bearer ${stored.token}`;
  } catch {}
  return headers;
}

async function controlPlaneRequest<T>(path: string, options?: ApiRequestInit): Promise<T> {
  const timeoutMs = requestTimeoutMs(options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  options?.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const { timeoutMs: _timeoutMs, signal: _signal, headers: optionHeaders, ...fetchOptions } = options || {};
    const res = await fetch(path, {
      credentials: 'include',
      ...fetchOptions,
      headers: {
        ...pocketBaseAuthHeaders(),
        ...(optionHeaders || {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = normalizeMojibakeValue(await res.json().catch(() => null));
      const errMsg =
        typeof body?.message === 'string'
          ? normalizeMojibakeText(body.message)
          : typeof body?.error === 'string'
            ? normalizeMojibakeText(body.error)
            : normalizeMojibakeText(body?.error?.message || `HTTP ${res.status}`);
      const error = new Error(errMsg) as ApiRequestError;
      error.status = res.status;
      error.body = body;
      throw error;
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return normalizeApiJson(text, JSON.parse(text));
    } catch {
      const error = new Error(`Invalid JSON response from ${path}`) as ApiRequestError;
      error.status = res.status;
      error.body = normalizeMojibakeText(text);
      throw error;
    }
  } catch (err) {
    if ((err as ApiRequestError).status !== undefined) throw err;
    const error = new Error(
      err instanceof DOMException && err.name === 'AbortError'
        ? `Request timed out after ${Math.round(timeoutMs / 1000)}s.`
        : (err as Error).message || 'API request failed.',
    ) as ApiRequestError;
    error.status = 0;
    throw error;
  } finally {
    clearTimeout(timeout);
    options?.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export const nullTicketsApi = createNullTicketsApi((c, n, payload) =>
  request<any>(instanceApiPath(c, n, '/tickets'), {
    method: 'POST',
    body: JSON.stringify(payload),
    spaceScoped: (payload.method || 'GET').toUpperCase() === 'GET',
  }),
);

export const nullTicketsStoreApi = createNullTicketsStoreApi(request, withQuery);
export const spacesApi = createSpacesApi(request, withQuery);
export const eventsApi = createEventsApi(request, withQuery);

export const nullWatchApi = {
  getNullWatchHealth: (params?: NullWatchTarget) =>
    request<any>(withQuery('/nullwatch/health', { nullhub_watch: params?.watch })),
  getNullWatchSummary: (params?: NullWatchTarget) =>
    request<any>(withQuery('/nullwatch/v1/summary', { nullhub_watch: params?.watch })),
  getNullWatchRuns: (params?: NullWatchTarget & { run_id?: string; source?: string; operation?: string; status?: string; model?: string; tool_name?: string; verdict?: string; dataset?: string; limit?: number; space?: string }) =>
    request<any>(
      withQuery('/nullwatch/v1/runs', {
        nullhub_watch: params?.watch,
        space: params?.space,
        run_id: params?.run_id,
        source: params?.source,
        operation: params?.operation,
        status: params?.status,
        model: params?.model,
        tool_name: params?.tool_name,
        verdict: params?.verdict,
        dataset: params?.dataset,
        limit: params?.limit,
      }),
    ),
  getNullWatchRun: (runId: string, params?: NullWatchTarget) =>
    request<any>(
      withQuery(`/nullwatch/v1/runs/${encodeURIComponent(runId)}`, {
        nullhub_watch: params?.watch,
      }),
    ),
  getNullWatchSpans: (params?: NullWatchTarget & { run_id?: string; trace_id?: string; source?: string; operation?: string; status?: string; model?: string; tool_name?: string; task_id?: string; session_id?: string; agent_id?: string; limit?: number }) =>
    request<any>(
      withQuery('/nullwatch/v1/spans', {
        nullhub_watch: params?.watch,
        run_id: params?.run_id,
        trace_id: params?.trace_id,
        source: params?.source,
        operation: params?.operation,
        status: params?.status,
        model: params?.model,
        tool_name: params?.tool_name,
        task_id: params?.task_id,
        session_id: params?.session_id,
        agent_id: params?.agent_id,
        limit: params?.limit,
      }),
    ),
  getNullWatchEvals: (params?: NullWatchTarget & { run_id?: string; verdict?: string; eval_key?: string; scorer?: string; dataset?: string; limit?: number }) =>
    request<any>(
      withQuery('/nullwatch/v1/evals', {
        nullhub_watch: params?.watch,
        run_id: params?.run_id,
        verdict: params?.verdict,
        eval_key: params?.eval_key,
        scorer: params?.scorer,
        dataset: params?.dataset,
        limit: params?.limit,
      }),
    ),
};

export const missionControlApi = createMissionControlApi(request);
export const nullBoilerApi = createNullBoilerApi(request, withQuery);

export const api = {
  getStatus: () => request<any>('/status'),
  getGlobalUsage: (window: '24h' | '7d' | '30d' | 'all' = '24h') =>
    request<any>(`/usage?window=${window}`),
  getComponents: () => request<any>('/components'),
  getInstances: () => request<any>('/instances'),
  getWizard: (component: string, version = '') =>
    request<any>(withQuery(`/wizard/${component}`, { version })),
  getVersions: (component: string) => request<any>(`/wizard/${component}/versions`),
  getWizardModels: (component: string, provider: string, apiKey = '') =>
    request<any>(`/wizard/${component}/models`, {
      method: 'POST',
      body: JSON.stringify({ provider, api_key: apiKey }),
    }),
  getFreePort: () => request<any>('/free-port'),
  postWizard: (component: string, data: any) =>
    request<any>(`/wizard/${component}`, { method: 'POST', body: JSON.stringify(data) }),
  startInstance: (c: string, n: string, modeOrOptions?: string | InstanceStartOptions) =>
    request<any>(instanceApiPath(c, n, '/start'), {
      method: 'POST',
      body:
        typeof modeOrOptions === 'string'
          ? JSON.stringify({ launch_mode: modeOrOptions })
          : modeOrOptions
            ? JSON.stringify(modeOrOptions)
            : undefined
    }),
  stopInstance: (c: string, n: string) =>
    request<any>(instanceApiPath(c, n, '/stop'), { method: 'POST' }),
  restartInstance: (c: string, n: string, options?: InstanceStartOptions) =>
    request<any>(instanceApiPath(c, n, '/restart'), {
      method: 'POST',
      body: options ? JSON.stringify(options) : undefined
    }),
  deleteInstance: (c: string, n: string, options?: InstanceDeleteOptions) =>
    request<any>(withQuery(instanceApiPath(c, n), { force: options?.force ? 1 : undefined }), {
      method: 'DELETE'
    }),
  getConfig: (c: string, n: string) => request<any>(instanceApiPath(c, n, '/config')),
  getProviderHealth: (c: string, n: string) =>
    request<any>(instanceApiPath(c, n, '/provider-health'), { timeoutMs: 30000 }),
  getUsage: (c: string, n: string, window: '24h' | '7d' | '30d' | 'all' = '24h') =>
    request<any>(withQuery(instanceApiPath(c, n, '/usage'), { window })),
  getHistory: (c: string, n: string, params?: { sessionId?: string; limit?: number; offset?: number }) =>
    request<any>(
      withQuery(instanceApiPath(c, n, '/history'), {
        session_id: params?.sessionId,
        limit: params?.limit,
        offset: params?.offset,
      }),
      { timeoutMs: HISTORY_READ_TIMEOUT_MS },
    ),
  invokeAgent: (
    c: string,
    n: string,
    payload: AgentInvokeRequest,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ) =>
    request<AgentInvokeResponse>(instanceApiPath(c, n, '/agent'), {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? ADMIN_MUTATION_TIMEOUT_MS,
    }),
  getAgentSessions: (c: string, n: string, sessionId?: string) =>
    request<{ sessions?: AgentSessionSummary[]; total?: number } | AgentSessionSummary>(
      withQuery(instanceApiPath(c, n, '/agent-sessions'), { session_id: sessionId }),
      { timeoutMs: ADMIN_READ_TIMEOUT_MS },
    ),
  deleteAgentSession: (c: string, n: string, sessionId: string) =>
    request<any>(withQuery(instanceApiPath(c, n, '/agent-sessions'), { session_id: sessionId }), {
      method: 'DELETE',
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  getOnboarding: (c: string, n: string) =>
    request<any>(instanceApiPath(c, n, '/onboarding')),
  listDocs: (c: string, n: string) =>
    request<any>(instanceApiPath(c, n, '/docs'), { timeoutMs: 15000 }),
  getDoc: (c: string, n: string, path: string) =>
    request<any>(withQuery(instanceApiPath(c, n, '/docs'), { path }), { timeoutMs: 15000 }),
  saveDoc: (c: string, n: string, path: string, content: string) =>
    request<any>(instanceApiPath(c, n, '/docs'), {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    }),
  deleteDoc: (c: string, n: string, path: string) =>
    request<any>(withQuery(instanceApiPath(c, n, '/docs'), { path }), {
      method: 'DELETE',
    }),
  getMemory: (
    c: string,
    n: string,
    params?: { stats?: boolean; key?: string; query?: string; category?: string; limit?: number },
  ) =>
    request<any>(
      withQuery(instanceApiPath(c, n, '/memory'), {
        stats: params?.stats ? 1 : undefined,
        key: params?.key,
        query: params?.query,
        category: params?.category,
        limit: params?.limit,
      }),
    ),
  getSkills: (c: string, n: string, name?: string) =>
    request<any>(withQuery(instanceApiPath(c, n, '/skills'), { name }), { timeoutMs: ADMIN_READ_TIMEOUT_MS }),
  getMcpServers: (c: string, n: string) =>
    request<McpServerSummary[]>(instanceApiPath(c, n, '/mcp'), { timeoutMs: ADMIN_READ_TIMEOUT_MS }),
  getMcpServer: (c: string, n: string, server: string) =>
    request<McpServerSummary>(withQuery(instanceApiPath(c, n, '/mcp'), { name: server }), { timeoutMs: 15000 }),
  createMcpServer: (c: string, n: string, server: McpServerDraft) =>
    request<McpMutationResult>(instanceApiPath(c, n, '/mcp'), {
      method: 'POST',
      body: JSON.stringify(server),
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  updateMcpServer: (c: string, n: string, serverName: string, server: McpServerDraft) =>
    request<McpMutationResult>(withQuery(instanceApiPath(c, n, '/mcp'), { name: serverName }), {
      method: 'PATCH',
      body: JSON.stringify(server),
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  deleteMcpServer: (c: string, n: string, serverName: string) =>
    request<McpMutationResult>(withQuery(instanceApiPath(c, n, '/mcp'), { name: serverName }), {
      method: 'DELETE',
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  validateMcpServer: (c: string, n: string, server: McpServerDraft) =>
    request<McpMutationResult>(instanceApiPath(c, n, '/mcp-validate'), {
      method: 'POST',
      body: JSON.stringify(server),
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  reloadMcp: (c: string, n: string) =>
    request<any>(instanceApiPath(c, n, '/mcp-reload'), { method: 'POST', timeoutMs: ADMIN_MUTATION_TIMEOUT_MS }),
  probeMcpServer: (c: string, n: string, serverName: string) =>
    request<McpServerSummary>(withQuery(instanceApiPath(c, n, '/mcp-probe'), { name: serverName }), {
      method: 'POST',
      timeoutMs: 20000,
    }),
  getSkillCatalog: (c: string, n: string) =>
    request<any>(withQuery(instanceApiPath(c, n, '/skills'), { catalog: 1 }), { timeoutMs: ADMIN_READ_TIMEOUT_MS }),
  getCronJobs: (c: string, n: string) =>
    request<any>(instanceApiPath(c, n, '/cron'), { timeoutMs: 15000 }),
  createCronJob: (c: string, n: string, payload: CronJobCreateRequest) =>
    request<any>(instanceApiPath(c, n, '/cron'), {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  createOneShotCronJob: (c: string, n: string, payload: CronJobCreateRequest) =>
    request<any>(instanceApiPath(c, n, '/cron/once'), {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  getCronJob: (c: string, n: string, jobId: string) =>
    request<any>(`${instanceApiPath(c, n, '/cron')}/${encodePathSegment(jobId)}`, { timeoutMs: 15000 }),
  getCronRuns: (c: string, n: string, jobId: string, limit = 10) =>
    request<any>(
      withQuery(`${instanceApiPath(c, n, '/cron')}/${encodePathSegment(jobId)}/runs`, { limit }),
      { timeoutMs: 15000 },
    ),
  runCronJob: (c: string, n: string, jobId: string) =>
    request<any>(`${instanceApiPath(c, n, '/cron')}/${encodePathSegment(jobId)}/run`, {
      method: 'POST',
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  pauseCronJob: (c: string, n: string, jobId: string) =>
    request<any>(`${instanceApiPath(c, n, '/cron')}/${encodePathSegment(jobId)}/pause`, {
      method: 'POST',
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  resumeCronJob: (c: string, n: string, jobId: string) =>
    request<any>(`${instanceApiPath(c, n, '/cron')}/${encodePathSegment(jobId)}/resume`, {
      method: 'POST',
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  updateCronJob: (c: string, n: string, jobId: string, payload: CronJobUpdateRequest) =>
    request<any>(`${instanceApiPath(c, n, '/cron')}/${encodePathSegment(jobId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  deleteCronJob: (c: string, n: string, jobId: string) =>
    request<any>(`${instanceApiPath(c, n, '/cron')}/${encodePathSegment(jobId)}`, {
      method: 'DELETE',
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  installBundledSkill: (c: string, n: string, bundled: string) =>
    request<any>(instanceApiPath(c, n, '/skills'), {
      method: 'POST',
      body: JSON.stringify({ bundled }),
      timeoutMs: ADMIN_INSTALL_TIMEOUT_MS,
    }),
  installSkillFromClawhub: (c: string, n: string, clawhub_slug: string) =>
    request<any>(instanceApiPath(c, n, '/skills'), {
      method: 'POST',
      body: JSON.stringify({ clawhub_slug }),
      timeoutMs: ADMIN_INSTALL_TIMEOUT_MS,
    }),
  installSkillFromSource: (c: string, n: string, source: string) =>
    request<any>(instanceApiPath(c, n, '/skills'), {
      method: 'POST',
      body: JSON.stringify({ source }),
      timeoutMs: ADMIN_INSTALL_TIMEOUT_MS,
    }),
  removeSkill: (c: string, n: string, skillName: string) =>
    request<any>(withQuery(instanceApiPath(c, n, '/skills'), { name: skillName }), {
      method: 'DELETE',
      timeoutMs: ADMIN_MUTATION_TIMEOUT_MS,
    }),
  getIntegration: (c: string, n: string) =>
    request<any>(instanceApiPath(c, n, '/integration')),
  linkIntegration: (c: string, n: string, payload: any) =>
    request<any>(instanceApiPath(c, n, '/integration'), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  ...nullTicketsApi,
  ...nullTicketsStoreApi,
  putConfig: (c: string, n: string, config: any) =>
    request<any>(instanceApiPath(c, n, '/config'), { method: 'PUT', body: JSON.stringify(config) }),
  getLogs: (c: string, n: string, lines = 100, source: LogSource = 'instance') =>
    request<any>(withQuery(instanceApiPath(c, n, '/logs'), { lines, source })),
  clearLogs: (c: string, n: string, source: LogSource = 'instance') =>
    request<any>(withQuery(instanceApiPath(c, n, '/logs'), { source }), { method: 'DELETE' }),
  getUpdates: () => request<any>('/updates'),
  getSettings: () => request<any>('/settings'),
  putSettings: (settings: any) =>
    request<any>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  patchConfig: (c: string, n: string, config: any) =>
    request<any>(instanceApiPath(c, n, '/config'), { method: 'PATCH', body: JSON.stringify(config) }),

  patchInstance: (c: string, n: string, settings: any) =>
    request<any>(instanceApiPath(c, n), { method: 'PATCH', body: JSON.stringify(settings) }),

  getComponentManifest: (name: string) => request<any>(`/components/${encodePathSegment(name)}/manifest`),

  refreshComponents: () => request<any>('/components/refresh', { method: 'POST' }),

  ...nullWatchApi,

  ...missionControlApi,

  ...eventsApi,

  applyUpdate: (c: string, n: string) =>
    request<any>(instanceApiPath(c, n, '/update'), { method: 'POST' }),

  serviceInstall: () => request<any>('/service/install', { method: 'POST' }),

  serviceUninstall: () => request<any>('/service/uninstall', { method: 'POST' }),

  serviceStatus: () => request<any>('/service/status'),

  importInstance: (component: string, data?: ImportInstanceRequest) =>
    request<any>(componentApiPath(component, '/import'), {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),
  getStandalone: (component: string) =>
    request<StandaloneInfo>(componentApiPath(component, '/standalone')),

  getUiModules: () => request<{ modules: Record<string, string> }>('/ui-modules'),
  getAvailableUiModules: () => request<{ name: string; repo: string; component: string }[]>('/ui-modules/available'),
  installUiModule: (name: string) => request<any>(`/ui-modules/${name}/install`, { method: 'POST' }),
  uninstallUiModule: (name: string) => request<any>(`/ui-modules/${name}`, { method: 'DELETE' }),

  validateProviders: (component: string, providers: any[]) =>
    request<any>(`/wizard/${component}/validate-providers`, {
      method: 'POST',
      body: JSON.stringify({ providers }),
    }),

  validateChannels: (component: string, channels: Record<string, any>) =>
    request<any>(`/wizard/${component}/validate-channels`, {
      method: 'POST',
      body: JSON.stringify({ channels }),
    }),

  // Saved providers
  getSavedProviders: (reveal = false) =>
    request<any>(`/providers${reveal ? '?reveal=true' : ''}`),
  createSavedProvider: (data: { provider: string; api_key: string; model?: string; base_url?: string }) =>
    request<any>('/providers', { method: 'POST', body: JSON.stringify(withSelectedSpaceBody(data)) }),
  updateSavedProvider: (id: string, data: { name?: string; api_key?: string; model?: string; base_url?: string }) =>
    request<any>(`/providers/${id.replace('sp_', '')}`, { method: 'PUT', body: JSON.stringify(withSelectedSpaceBody(data)) }),
  deleteSavedProvider: (id: string) =>
    request<any>(`/providers/${id.replace('sp_', '')}`, { method: 'DELETE' }),
  revalidateSavedProvider: (id: string) =>
    request<any>(`/providers/${id.replace('sp_', '')}/validate`, { method: 'POST' }),
  probeProviderModels: (baseUrl: string, apiKey: string) =>
    request<{ live_ok: boolean; reason: string; models: string[] }>('/providers/probe-models', {
      method: 'POST',
      body: JSON.stringify({ base_url: baseUrl, api_key: apiKey }),
    }),

  // Saved channels
  getSavedChannels: (reveal = false) =>
    request<any>(`/channels${reveal ? '?reveal=true' : ''}`),
  connectTelegram: (data: { telegramBotToken: string }) =>
    controlPlaneRequest<any>('/api/me/telegram/connect', { method: 'POST', body: JSON.stringify(data) }),
  createSavedChannel: (data: { channel_type: string; account: string; config: Record<string, any> }) =>
    request<any>('/channels', { method: 'POST', body: JSON.stringify(withSelectedSpaceBody(data)) }),
  updateSavedChannel: (id: string, data: { name?: string; account?: string; config?: Record<string, any> }) =>
    request<any>(`/channels/${id.replace('sc_', '')}`, { method: 'PUT', body: JSON.stringify(withSelectedSpaceBody(data)) }),
  deleteSavedChannel: (id: string) =>
    request<any>(`/channels/${id.replace('sc_', '')}`, { method: 'DELETE' }),
  revalidateSavedChannel: (id: string) =>
    request<any>(`/channels/${id.replace('sc_', '')}/validate`, { method: 'POST' }),
  reportPreview: (data: { repo: string; type: string; message: string }) =>
    request<{ title: string; markdown: string; labels: string[]; repo: string }>('/report/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getReportMeta: () =>
    request<{ repos: ReportRepoOption[]; types: ReportTypeOption[] }>('/report/meta'),

  submitReport: (data: { repo: string; type: string; message: string; markdown?: string }) =>
    request<{ status: string; url?: string; title?: string; markdown?: string; labels?: string[]; repo?: string; hint?: string; error?: string; manual_url?: string }>('/report', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  ...nullBoilerApi,
};
