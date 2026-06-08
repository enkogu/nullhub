export function createEmptyMcpDraft() {
  return {
    name: "",
    transport: "stdio",
    command: "",
    args: [],
    url: "",
    env: {},
    headers: {},
    timeout_ms: 10000,
  };
}

export function normalizeMcpTransport(value) {
  return value === "http" ? "http" : "stdio";
}

export function mcpListToText(values) {
  return Array.isArray(values) ? values.join("\n") : "";
}

export function mcpObjectToText(value) {
  if (!value) return "";
  return Object.entries(value)
    .map(([key, item]) => `${key}=${item}`)
    .join("\n");
}

export function mcpTextToList(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function mcpTextToObject(value) {
  const out = {};
  for (const rawLine of String(value ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) {
      out[line] = "";
    } else {
      out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return out;
}

export function hydrateMcpEditorState(server) {
  const draft = createEmptyMcpDraft();
  if (server) {
    draft.name = server.name;
    draft.transport = normalizeMcpTransport(server.transport);
    draft.command = server.command || "";
    draft.args = Array.isArray(server.args) ? server.args : [];
    draft.url = server.url || "";
    draft.timeout_ms = typeof server.timeout_ms === "number" ? server.timeout_ms : 10000;
  }
  return {
    draft,
    argsText: mcpListToText(draft.args),
    envText: "",
    headerText: "",
    replaceEnv: false,
    replaceHeaders: false,
  };
}

export function buildMcpServerDraft(draft, options = {}) {
  const replaceEnv = Boolean(options.replaceEnv);
  const replaceHeaders = Boolean(options.replaceHeaders);
  const transport = normalizeMcpTransport(draft?.transport);
  const next = {
    name: String(draft?.name ?? "").trim(),
    transport,
    timeout_ms: Number(draft?.timeout_ms) || 0,
  };

  if (transport === "stdio") {
    next.command = String(draft?.command ?? "").trim();
    next.args = mcpTextToList(options.argsText);
  } else {
    next.url = String(draft?.url ?? "").trim();
    const headers = mcpTextToObject(options.headerText);
    if (Object.keys(headers).length > 0 || replaceHeaders) next.headers = headers;
    if (replaceHeaders) next.replace_headers = true;
  }

  const env = mcpTextToObject(options.envText);
  if (Object.keys(env).length > 0 || replaceEnv) next.env = env;
  if (replaceEnv) next.replace_env = true;
  return next;
}

export function describeMcpMutationResult(result, fallback) {
  if (result?.message) return result.message;
  if (result?.requires_restart) return `${fallback} Restart this instance to apply the change.`;
  if (result?.requires_reload) return `${fallback} Reload config to apply the change.`;
  return fallback;
}
