<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { listMarkdownDocuments } from "$lib/api/markdownDocuments";

  type RegistryKind = "skills" | "mcp" | "hooks" | "instructions" | "memory" | "schedules";

  type RegistryRow = {
    id: string;
    name: string;
    source: string;
    status: string;
    detail: string;
    meta: string;
    href?: string;
  };

  const hookTemplates = [
    { id: "input-command-guard", title: "Input Command Guard", category: "Input", event: "input", goal: "Block unsafe user requests before they reach the model.", command: "bash hooks/input-command-guard.sh", on_error: "block", timeout_ms: 1000, output: "decision:block" },
    { id: "input-router", title: "Input Router", category: "Input", event: "input", goal: "Rewrite user input into a normalized routing envelope.", command: "bash hooks/input-router.sh", on_error: "warn", timeout_ms: 1000, output: "replace_input" },
    { id: "input-context-hints", title: "Input Context Hints", category: "Input", event: "input", goal: "Add repo or ticket hints derived from the prompt.", command: "bash hooks/input-context-hints.sh", on_error: "warn", timeout_ms: 1500, output: "append_context" },
    { id: "context-rag-inject", title: "RAG Context Inject", category: "Context", event: "context", goal: "Inject local search or memory snippets into the provider prompt.", command: "bash hooks/context-rag-inject.sh", on_error: "warn", timeout_ms: 2000, output: "append_context" },
    { id: "context-token-killer", title: "Rust Token Killer", category: "Context", event: "context", goal: "Compress or replace bulky context before the LLM call.", command: "rust-token-killer --hook", on_error: "block", timeout_ms: 5000, output: "append_context" },
    { id: "context-policy-banner", title: "Policy Banner", category: "Context", event: "context", goal: "Attach workspace policy and deployment guardrails.", command: "bash hooks/context-policy-banner.sh", on_error: "warn", timeout_ms: 1000, output: "append_context" },
    { id: "tool-shell-allowlist", title: "Shell Allowlist", category: "Tool Call", event: "tool_call", goal: "Block dangerous shell commands before execution.", command: "bash hooks/tool-shell-allowlist.sh", on_error: "block", timeout_ms: 1000, output: "decision:block" },
    { id: "tool-git-protect", title: "Git Protect", category: "Tool Call", event: "tool_call", goal: "Prevent destructive git operations unless explicitly allowed.", command: "bash hooks/tool-git-protect.sh", on_error: "block", timeout_ms: 1000, output: "decision:block" },
    { id: "tool-cwd-fence", title: "CWD Fence", category: "Tool Call", event: "tool_call", goal: "Reject tool calls outside the current workspace.", command: "bash hooks/tool-cwd-fence.sh", on_error: "block", timeout_ms: 1000, output: "decision:block" },
    { id: "tool-args-normalize", title: "Tool Args Normalize", category: "Tool Call", event: "tool_call", goal: "Patch tool arguments into a canonical JSON shape.", command: "bash hooks/tool-args-normalize.sh", on_error: "warn", timeout_ms: 1000, output: "replace_input" },
    { id: "tool-browser-gate", title: "Browser Tool Gate", category: "Tool Call", event: "tool_call", goal: "Gate browser or external automation tools by channel.", command: "bash hooks/tool-browser-gate.sh", on_error: "block", timeout_ms: 1000, output: "decision:block" },
    { id: "tool-result-summarize", title: "Tool Result Summarize", category: "Tool Result", event: "tool_result", goal: "Collapse noisy command output before it returns to the model.", command: "bash hooks/tool-result-summarize.sh", on_error: "warn", timeout_ms: 2000, output: "patch_result.content" },
    { id: "tool-result-secret-scan", title: "Secret Scan Result", category: "Tool Result", event: "tool_result", goal: "Redact tokens or keys from tool output.", command: "bash hooks/tool-result-secret-scan.sh", on_error: "block", timeout_ms: 1500, output: "patch_result.content" },
    { id: "tool-result-test-parser", title: "Test Result Parser", category: "Tool Result", event: "tool_result", goal: "Convert test logs into structured pass/fail feedback.", command: "bash hooks/tool-result-test-parser.sh", on_error: "warn", timeout_ms: 2000, output: "feedback" },
    { id: "tool-result-artifact-index", title: "Artifact Index", category: "Tool Result", event: "tool_result", goal: "Extract generated file paths from tool output.", command: "bash hooks/tool-result-artifact-index.sh", on_error: "ignore", timeout_ms: 1500, output: "feedback" },
    { id: "stop-review-gate", title: "Stop Review Gate", category: "Stop", event: "stop", goal: "Block final responses that skipped tests or verification.", command: "bash hooks/stop-review-gate.sh", on_error: "block", timeout_ms: 2000, output: "decision:block" },
    { id: "stop-continue-if-unfinished", title: "Continue If Unfinished", category: "Stop", event: "stop", goal: "Ask the agent to continue when a required checklist is incomplete.", command: "bash hooks/stop-continue-if-unfinished.sh", on_error: "warn", timeout_ms: 2000, output: "continue.prompt" },
    { id: "stop-final-redactor", title: "Final Redactor", category: "Stop", event: "stop", goal: "Redact sensitive content from the final answer.", command: "bash hooks/stop-final-redactor.sh", on_error: "block", timeout_ms: 1500, output: "handled_response" },
    { id: "turn-end-metrics", title: "Turn Metrics", category: "Turn End", event: "turn_end", goal: "Emit usage, duration, and status metrics after a turn.", command: "bash hooks/turn-end-metrics.sh", on_error: "ignore", timeout_ms: 1000, output: "status" },
    { id: "turn-end-memory-save", title: "Memory Save", category: "Turn End", event: "turn_end", goal: "Persist final response summaries to an external memory system.", command: "bash hooks/turn-end-memory-save.sh", on_error: "warn", timeout_ms: 2000, output: "status" },
    { id: "file-changed-fmt", title: "File Changed Format", category: "Files", event: "file.changed", goal: "Run formatter checks on changed files.", command: "bash hooks/file-changed-fmt.sh", on_error: "warn", timeout_ms: 5000, output: "feedback" },
    { id: "file-changed-doc-index", title: "Doc Index Refresh", category: "Files", event: "file.changed", goal: "Update a local documentation index after docs change.", command: "bash hooks/file-changed-doc-index.sh", on_error: "ignore", timeout_ms: 3000, output: "status" },
    { id: "before-agent-start-env", title: "Startup Env Check", category: "Lifecycle", event: "before_agent_start", goal: "Validate required env vars and local binaries before launch.", command: "bash hooks/before-agent-start-env.sh", on_error: "block", timeout_ms: 2000, output: "decision:block" },
    { id: "session-start-brief", title: "Session Brief", category: "Lifecycle", event: "session_start", goal: "Inject a short session brief when a new session opens.", command: "bash hooks/session-start-brief.sh", on_error: "warn", timeout_ms: 1500, output: "append_context" },
    { id: "session-end-archive", title: "Session Archive", category: "Lifecycle", event: "session_end", goal: "Archive session metadata for audit and analytics.", command: "bash hooks/session-end-archive.sh", on_error: "ignore", timeout_ms: 2000, output: "status" },
    { id: "pre-compact-snapshot", title: "Pre Compact Snapshot", category: "Compaction", event: "pre_compact", goal: "Save raw context before compaction runs.", command: "bash hooks/pre-compact-snapshot.sh", on_error: "ignore", timeout_ms: 2000, output: "status" },
    { id: "post-compact-qa", title: "Post Compact QA", category: "Compaction", event: "post_compact", goal: "Check compacted context for missing task state.", command: "bash hooks/post-compact-qa.sh", on_error: "warn", timeout_ms: 2000, output: "feedback" },
    { id: "tool-batch-summary", title: "Tool Batch Summary", category: "Tool Result", event: "tool_batch_result", goal: "Summarize multi-tool batches into a compact result.", command: "bash hooks/tool-batch-summary.sh", on_error: "warn", timeout_ms: 3000, output: "patch_result.content" },
    { id: "notification-slack", title: "Notification Sink", category: "Notifications", event: "notification", goal: "Forward notifications to Slack, Telegram, or a local webhook.", command: "bash hooks/notification-sink.sh", on_error: "ignore", timeout_ms: 2000, output: "status" },
    { id: "notification-priority", title: "Priority Notification", category: "Notifications", event: "notification", goal: "Escalate only high-priority notifications.", command: "bash hooks/notification-priority.sh", on_error: "ignore", timeout_ms: 1000, output: "status" },
  ];

  let {
    kind,
    title,
  } = $props<{
    kind: RegistryKind;
    title: string;
  }>();

  let rows = $state<RegistryRow[]>([]);
  let errors = $state<string[]>([]);
  let loading = $state(false);
  let query = $state("");

  const filteredRows = $derived(
    rows.filter((row) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [row.name, row.source, row.status, row.detail, row.meta]
        .join(" ")
        .toLowerCase()
        .includes(q);
    }),
  );

  async function agentNames(): Promise<string[]> {
    const status = await api.getStatus();
    return Object.keys((status?.instances?.nullclaw || {}) as Record<string, any>).sort();
  }

  function asList(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.skills)) return value.skills;
    if (Array.isArray(value?.servers)) return value.servers;
    if (Array.isArray(value?.jobs)) return value.jobs;
    if (Array.isArray(value?.documents)) return value.documents;
    return [];
  }

  function compact(parts: unknown[]): string {
    return parts
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(" / ");
  }

  function registryKey(prefix: string, value: unknown): string {
    const raw = String(value ?? "").trim().toLowerCase();
    return `${prefix}:${raw || "unnamed"}`;
  }

  function mergeText(current: string, next: string, separator = ", "): string {
    const values = [...current.split(separator), ...next.split(separator)]
      .map((value) => value.trim())
      .filter(Boolean);
    return Array.from(new Set(values)).join(separator);
  }

  function mergeStatus(current: string, next: string): string {
    if (current === next) return current;
    const values = new Set([current, next]);
    if (values.has("missing")) return "missing";
    if (values.has("disabled")) return "disabled";
    if (values.has("inactive")) return "inactive";
    if (values.has("installed")) return "installed";
    if (values.has("enabled")) return "enabled";
    if (values.has("configured")) return "configured";
    if (values.has("active")) return "active";
    if (values.has("available")) return [...values].find((value) => value !== "available") || "available";
    return "mixed";
  }

  function mergeRows(items: RegistryRow[]): RegistryRow[] {
    const byId = new Map<string, RegistryRow>();

    for (const item of items) {
      const current = byId.get(item.id);
      if (!current) {
        byId.set(item.id, { ...item });
        continue;
      }

      current.source = mergeText(current.source, item.source);
      current.status = mergeStatus(current.status, item.status);
      current.detail = current.detail || item.detail;
      current.meta = mergeText(current.meta, item.meta, " / ");
      current.href = current.href || item.href;
    }

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function loadSkills(agent: string): Promise<RegistryRow[]> {
    const installed = asList(await api.getSkills("nullclaw", agent)).map((skill: any) => ({
      id: registryKey("skill", skill.name || skill.path),
      name: String(skill.name || skill.path || "Unnamed skill"),
      source: `Installed: ${agent}`,
      status: skill.available === false ? "missing" : skill.enabled === false ? "disabled" : "installed",
      detail: String(skill.description || skill.path || ""),
      meta: compact([skill.version, skill.source, skill.always ? "always" : "", skill.missing_deps]),
      href: `/instances/nullclaw/${encodeURIComponent(agent)}#skills`,
    }));

    const installedNames = new Set(installed.map((row) => row.name));
    const catalog = asList(await api.getSkillCatalog("nullclaw", agent).catch(() => [])).map((skill: any) => ({
      id: registryKey("skill", skill.name || skill.clawhub_slug),
      name: String(skill.name || skill.clawhub_slug || "Unnamed skill"),
      source: "Catalog",
      status: installedNames.has(String(skill.name || "")) ? "installed" : "available",
      detail: String(skill.description || skill.homepage_url || ""),
      meta: compact([skill.version, skill.install_kind, skill.recommended ? "recommended" : "", skill.source]),
      href: `/instances/nullclaw/${encodeURIComponent(agent)}#skills`,
    }));

    return [...installed, ...catalog];
  }

  async function loadMcp(agent: string): Promise<RegistryRow[]> {
    return asList(await api.getMcpServers("nullclaw", agent)).map((server: any) => ({
      id: registryKey("mcp", compact([server.name, server.url || server.command])),
      name: String(server.name || "Unnamed MCP server"),
      source: `Configured: ${agent}`,
      status: String(server.status || server.transport || "configured"),
      detail: String(server.url || server.command || ""),
      meta: compact([
        server.transport,
        typeof server.tool_count === "number" ? `${server.tool_count} tools` : "",
        server.last_error,
      ]),
      href: `/instances/nullclaw/${encodeURIComponent(agent)}#mcp`,
    }));
  }

  async function loadHooks(agent: string): Promise<RegistryRow[]> {
    const config = await api.getConfig("nullclaw", agent);
    const hooks = config?.agent?.hooks || config?.hooks || {};
    return asList(hooks.handlers).map((hook: any) => ({
      id: registryKey("hook", hook.id || compact([hook.event, hook.command])),
      name: String(hook.id || hook.event || "Unnamed hook"),
      source: `Configured: ${agent}`,
      status: hook.enabled === false ? "disabled" : hooks.enabled === false ? "inactive" : "configured",
      detail: String(hook.command || ""),
      meta: compact([hook.event, hook.mode, hook.on_error, hook.timeout_ms ? `${hook.timeout_ms}ms` : ""]),
      href: `/instances/nullclaw/${encodeURIComponent(agent)}#hooks`,
    }));
  }

  function loadHookTemplates(): RegistryRow[] {
    return hookTemplates.map((hook) => ({
      id: registryKey("hook", hook.id),
      name: hook.title,
      source: "Template",
      status: "available",
      detail: hook.goal,
      meta: compact([hook.category, hook.event, hook.output, hook.on_error, `${hook.timeout_ms}ms`]),
    }));
  }

  async function loadInstructions(agent: string): Promise<RegistryRow[]> {
    const docs = await listMarkdownDocuments("nullclaw", agent);
    return docs.map((entry) => ({
      id: registryKey("instruction", entry.document.path || entry.key),
      name: entry.document.title || entry.document.path,
      source: entry.document.source === "workspace" ? `Workspace: ${agent}` : "Store",
      status: entry.document.source,
      detail: entry.document.path,
      meta: compact([entry.document.tags?.join(", "), entry.document.artifact_id]),
      href: `/instances/nullclaw/${encodeURIComponent(agent)}#docs`,
    }));
  }

  async function loadMemory(agent: string): Promise<RegistryRow[]> {
    const stats = await api.getMemory("nullclaw", agent, { stats: true });
    return [
      {
        id: registryKey("memory", stats?.backend || "memory"),
        name: String(stats?.backend || "Memory"),
        source: `Configured: ${agent}`,
        status: String(stats?.retrieval || stats?.sync || "configured"),
        detail: compact([stats?.vector, stats?.embedding, stats?.rollout]),
        meta: compact([
          stats?.entries != null ? `${stats.entries} entries` : "",
          stats?.sources != null ? `${stats.sources} sources` : "",
          stats?.outbox_pending != null ? `${stats.outbox_pending} pending` : "",
        ]),
        href: `/instances/nullclaw/${encodeURIComponent(agent)}#memory`,
      },
    ];
  }

  async function loadSchedules(agent: string): Promise<RegistryRow[]> {
    return asList(await api.getCronJobs("nullclaw", agent)).map((job: any) => ({
      id: registryKey("schedule", job.id || compact([job.expression, job.prompt, job.command])),
      name: String(job.id || job.expression || "Unnamed schedule"),
      source: `Configured: ${agent}`,
      status: job.enabled === false ? "disabled" : job.paused ? "paused" : "active",
      detail: String(job.prompt || job.command || ""),
      meta: compact([job.expression, job.job_type, job.model, job.one_shot ? "one-shot" : ""]),
      href: `/instances/nullclaw/${encodeURIComponent(agent)}#cron`,
    }));
  }

  async function loadForAgent(agent: string): Promise<RegistryRow[]> {
    if (kind === "skills") return loadSkills(agent);
    if (kind === "mcp") return loadMcp(agent);
    if (kind === "hooks") return loadHooks(agent);
    if (kind === "instructions") return loadInstructions(agent);
    if (kind === "memory") return loadMemory(agent);
    return loadSchedules(agent);
  }

  async function refresh() {
    loading = true;
    errors = [];
    try {
      const agents = await agentNames();
      const results = await Promise.allSettled(agents.map((agent) => loadForAgent(agent)));
      const loadedRows = results.flatMap((result, index) => {
        if (result.status === "fulfilled") return result.value;
        errors = [...errors, `${agents[index]}: ${result.reason?.message || "failed to load"}`];
        return [];
      });
      rows = mergeRows(kind === "hooks" ? [...loadedRows, ...loadHookTemplates()] : loadedRows);
    } catch (error) {
      rows = [];
      errors = [(error as Error).message || "Failed to load registry."];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void refresh();
  });
</script>

<div class="page">
  <div class="header">
    <h1>{title}</h1>
    <div class="actions">
      <input bind:value={query} placeholder="Search" />
      <button class="btn" onclick={refresh} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
    </div>
  </div>

  {#each errors as error}
    <div class="error-banner">ERR: {error}</div>
  {/each}

  <div class="table-card">
    <div class="table-head">
      <span>Name</span>
      <span>Status</span>
      <span>Detail</span>
      <span>Scope</span>
      <span></span>
    </div>
    {#if filteredRows.length === 0}
      <div class="empty-row">{loading ? "Loading..." : "No items"}</div>
    {:else}
      {#each filteredRows as row (row.id)}
        <div class="table-row">
          <div>
            <strong>{row.name}</strong>
            {#if row.meta}<span>{row.meta}</span>{/if}
          </div>
          <span>{row.status}</span>
          <span>{row.detail || "-"}</span>
          <span>{row.source}</span>
          {#if row.href}
            <a class="btn subtle" href={row.href}>Open</a>
          {:else}
            <span></span>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--shadcn-border);
  }

  h1 {
    margin: 0;
    color: var(--shadcn-foreground);
    font-size: 1.875rem;
    font-weight: 600;
    letter-spacing: 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  input {
    min-height: 2.25rem;
    width: min(16rem, 36vw);
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--shadcn-input);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
  }

  .table-card {
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
    overflow: hidden;
  }

  .table-head,
  .table-row {
    display: grid;
    grid-template-columns: minmax(180px, 1.2fr) 0.55fr minmax(220px, 1.4fr) 0.7fr auto;
    gap: 1rem;
    align-items: center;
  }

  .table-head {
    padding: 0.75rem 1rem;
    color: var(--shadcn-muted-foreground);
    border-bottom: 1px solid var(--shadcn-border);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .table-row {
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--shadcn-border);
  }

  .table-row:last-child {
    border-bottom: 0;
  }

  .table-row div {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .table-row strong,
  .table-row span {
    overflow-wrap: anywhere;
  }

  .table-row div span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }

  .btn {
    min-height: 2.25rem;
    padding: 0.5rem 0.875rem;
    border: 1px solid var(--shadcn-input);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
  }

  .btn:hover {
    background: var(--shadcn-accent);
  }

  .error-banner,
  .empty-row {
    padding: 1rem;
  }

  .error-banner {
    color: var(--shadcn-destructive);
    border: 1px solid color-mix(in srgb, var(--shadcn-destructive) 25%, var(--shadcn-border));
    border-radius: var(--shadcn-radius);
  }

  .empty-row {
    color: var(--shadcn-muted-foreground);
  }

  @media (max-width: 900px) {
    .header,
    .actions {
      align-items: stretch;
      flex-direction: column;
    }

    input {
      width: 100%;
    }

    .table-head {
      display: none;
    }

    .table-row {
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }
  }
</style>
