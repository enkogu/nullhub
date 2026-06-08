<script lang="ts">
  import { api } from "$lib/api/client";

  type HookHandler = {
    id?: string;
    event?: string;
    command?: string;
    enabled?: boolean;
    mode?: string;
    timeout_ms?: number;
    on_error?: string;
    tool?: string;
    tool_regex?: string;
    path_regex?: string;
    channel?: string;
    cwd_regex?: string;
  };

  type HookTemplate = {
    id: string;
    title: string;
    category: string;
    event: string;
    goal: string;
    command: string;
    on_error: "ignore" | "warn" | "block";
    timeout_ms: number;
    filter?: Partial<HookHandler>;
    output: string;
  };

  let { component, name, active = false } = $props<{
    component: string;
    name: string;
    active?: boolean;
  }>();

  const wiredEvents = new Set(["input", "context", "tool_call", "tool_result", "stop", "turn_end"]);
  const templates: HookTemplate[] = [
    { id: "input-command-guard", title: "Input Command Guard", category: "Input", event: "input", goal: "Block unsafe user requests before they reach the model.", command: "bash hooks/input-command-guard.sh", on_error: "block", timeout_ms: 1000, output: "decision:block + feedback" },
    { id: "input-router", title: "Input Router", category: "Input", event: "input", goal: "Rewrite user input into a normalized routing envelope.", command: "bash hooks/input-router.sh", on_error: "warn", timeout_ms: 1000, output: "replace_input" },
    { id: "input-context-hints", title: "Input Context Hints", category: "Input", event: "input", goal: "Add repo or ticket hints derived from the prompt.", command: "bash hooks/input-context-hints.sh", on_error: "warn", timeout_ms: 1500, output: "append_context" },
    { id: "context-rag-inject", title: "RAG Context Inject", category: "Context", event: "context", goal: "Inject local search or memory snippets into the provider prompt.", command: "bash hooks/context-rag-inject.sh", on_error: "warn", timeout_ms: 2000, output: "append_context" },
    { id: "context-token-killer", title: "Rust Token Killer", category: "Context", event: "context", goal: "Compress or replace bulky context before the LLM call.", command: "rust-token-killer --hook", on_error: "block", timeout_ms: 5000, output: "append_context" },
    { id: "context-policy-banner", title: "Policy Banner", category: "Context", event: "context", goal: "Attach workspace policy and deployment guardrails.", command: "bash hooks/context-policy-banner.sh", on_error: "warn", timeout_ms: 1000, output: "append_context" },
    { id: "tool-shell-allowlist", title: "Shell Allowlist", category: "Tool Call", event: "tool_call", goal: "Block dangerous shell commands before execution.", command: "bash hooks/tool-shell-allowlist.sh", on_error: "block", timeout_ms: 1000, filter: { tool: "shell" }, output: "decision:block" },
    { id: "tool-git-protect", title: "Git Protect", category: "Tool Call", event: "tool_call", goal: "Prevent destructive git operations unless explicitly allowed.", command: "bash hooks/tool-git-protect.sh", on_error: "block", timeout_ms: 1000, filter: { tool_regex: "^(shell|exec)$" }, output: "decision:block" },
    { id: "tool-cwd-fence", title: "CWD Fence", category: "Tool Call", event: "tool_call", goal: "Reject tool calls outside the current workspace.", command: "bash hooks/tool-cwd-fence.sh", on_error: "block", timeout_ms: 1000, filter: { cwd_regex: "^/workspace" }, output: "decision:block" },
    { id: "tool-args-normalize", title: "Tool Args Normalize", category: "Tool Call", event: "tool_call", goal: "Patch tool arguments into a canonical JSON shape.", command: "bash hooks/tool-args-normalize.sh", on_error: "warn", timeout_ms: 1000, output: "replace_input" },
    { id: "tool-browser-gate", title: "Browser Tool Gate", category: "Tool Call", event: "tool_call", goal: "Gate browser or external automation tools by channel.", command: "bash hooks/tool-browser-gate.sh", on_error: "block", timeout_ms: 1000, filter: { channel: "telegram" }, output: "decision:block" },
    { id: "tool-result-summarize", title: "Tool Result Summarize", category: "Tool Result", event: "tool_result", goal: "Collapse noisy command output before it returns to the model.", command: "bash hooks/tool-result-summarize.sh", on_error: "warn", timeout_ms: 2000, output: "patch_result.content" },
    { id: "tool-result-secret-scan", title: "Secret Scan Result", category: "Tool Result", event: "tool_result", goal: "Redact tokens or keys from tool output.", command: "bash hooks/tool-result-secret-scan.sh", on_error: "block", timeout_ms: 1500, output: "patch_result.content" },
    { id: "tool-result-test-parser", title: "Test Result Parser", category: "Tool Result", event: "tool_result", goal: "Convert test logs into structured pass/fail feedback.", command: "bash hooks/tool-result-test-parser.sh", on_error: "warn", timeout_ms: 2000, filter: { tool_regex: "^(shell|exec)$" }, output: "feedback" },
    { id: "tool-result-artifact-index", title: "Artifact Index", category: "Tool Result", event: "tool_result", goal: "Extract generated file paths from tool output.", command: "bash hooks/tool-result-artifact-index.sh", on_error: "ignore", timeout_ms: 1500, output: "feedback" },
    { id: "stop-review-gate", title: "Stop Review Gate", category: "Stop", event: "stop", goal: "Block final responses that skipped tests or verification.", command: "bash hooks/stop-review-gate.sh", on_error: "block", timeout_ms: 2000, output: "decision:block" },
    { id: "stop-continue-if-unfinished", title: "Continue If Unfinished", category: "Stop", event: "stop", goal: "Ask the agent to continue when a required checklist is incomplete.", command: "bash hooks/stop-continue-if-unfinished.sh", on_error: "warn", timeout_ms: 2000, output: "continue.prompt" },
    { id: "stop-final-redactor", title: "Final Redactor", category: "Stop", event: "stop", goal: "Redact sensitive content from the final answer.", command: "bash hooks/stop-final-redactor.sh", on_error: "block", timeout_ms: 1500, output: "handled_response" },
    { id: "turn-end-metrics", title: "Turn Metrics", category: "Turn End", event: "turn_end", goal: "Emit usage, duration, and status metrics after a turn.", command: "bash hooks/turn-end-metrics.sh", on_error: "ignore", timeout_ms: 1000, output: "status" },
    { id: "turn-end-memory-save", title: "Memory Save", category: "Turn End", event: "turn_end", goal: "Persist final response summaries to an external memory system.", command: "bash hooks/turn-end-memory-save.sh", on_error: "warn", timeout_ms: 2000, output: "status" },
    { id: "file-changed-fmt", title: "File Changed Format", category: "Files", event: "file.changed", goal: "Run formatter checks on changed files.", command: "bash hooks/file-changed-fmt.sh", on_error: "warn", timeout_ms: 5000, filter: { path_regex: "\\.(zig|ts|svelte)$" }, output: "feedback" },
    { id: "file-changed-doc-index", title: "Doc Index Refresh", category: "Files", event: "file.changed", goal: "Update a local documentation index after docs change.", command: "bash hooks/file-changed-doc-index.sh", on_error: "ignore", timeout_ms: 3000, filter: { path_regex: "\\.(md|mdx)$" }, output: "status" },
    { id: "before-agent-start-env", title: "Startup Env Check", category: "Lifecycle", event: "before_agent_start", goal: "Validate required env vars and local binaries before launch.", command: "bash hooks/before-agent-start-env.sh", on_error: "block", timeout_ms: 2000, output: "decision:block" },
    { id: "session-start-brief", title: "Session Brief", category: "Lifecycle", event: "session_start", goal: "Inject a short session brief when a new session opens.", command: "bash hooks/session-start-brief.sh", on_error: "warn", timeout_ms: 1500, output: "append_context" },
    { id: "session-end-archive", title: "Session Archive", category: "Lifecycle", event: "session_end", goal: "Archive session metadata for audit and analytics.", command: "bash hooks/session-end-archive.sh", on_error: "ignore", timeout_ms: 2000, output: "status" },
    { id: "pre-compact-snapshot", title: "Pre Compact Snapshot", category: "Compaction", event: "pre_compact", goal: "Save raw context before compaction runs.", command: "bash hooks/pre-compact-snapshot.sh", on_error: "ignore", timeout_ms: 2000, output: "status" },
    { id: "post-compact-qa", title: "Post Compact QA", category: "Compaction", event: "post_compact", goal: "Check compacted context for missing task state.", command: "bash hooks/post-compact-qa.sh", on_error: "warn", timeout_ms: 2000, output: "feedback" },
    { id: "tool-batch-summary", title: "Tool Batch Summary", category: "Tool Result", event: "tool_batch_result", goal: "Summarize multi-tool batches into a compact result.", command: "bash hooks/tool-batch-summary.sh", on_error: "warn", timeout_ms: 3000, output: "patch_result.content" },
    { id: "notification-slack", title: "Notification Sink", category: "Notifications", event: "notification", goal: "Forward notifications to Slack, Telegram, or a local webhook.", command: "bash hooks/notification-sink.sh", on_error: "ignore", timeout_ms: 2000, output: "status" },
    { id: "notification-priority", title: "Priority Notification", category: "Notifications", event: "notification", goal: "Escalate only high-priority notifications.", command: "bash hooks/notification-priority.sh", on_error: "ignore", timeout_ms: 1000, output: "status" },
  ];

  let config = $state<any>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let loadedKey = $state("");
  let query = $state("");
  let category = $state("All");
  let copiedId = $state("");
  let requestSeq = 0;

  const instanceKey = $derived(`${component}/${name}`);
  const supportsHooks = $derived(component === "nullclaw");
  const hooksConfig = $derived(config?.agent?.hooks || config?.hooks || {});
  const configuredHandlers = $derived(
    Array.isArray(hooksConfig?.handlers) ? hooksConfig.handlers as HookHandler[] : [],
  );
  const diagnostics = $derived(hooksConfig?.diagnostics || {});
  const categories = $derived(["All", ...Array.from(new Set(templates.map((item) => item.category))).sort()]);
  const filteredTemplates = $derived(
    templates.filter((item) => {
      const haystack = `${item.title} ${item.category} ${item.event} ${item.goal} ${item.command}`.toLowerCase();
      const matchesQuery = query.trim() === "" || haystack.includes(query.trim().toLowerCase());
      const matchesCategory = category === "All" || item.category === category;
      return matchesQuery && matchesCategory;
    }),
  );

  function eventState(event: string): string {
    return wiredEvents.has(event) ? "wired now" : "declared";
  }

  function templateHandler(item: HookTemplate): HookHandler {
    return {
      id: item.id,
      event: item.event,
      command: item.command,
      mode: "sync",
      timeout_ms: item.timeout_ms,
      on_error: item.on_error,
      ...(item.filter || {}),
    };
  }

  function prettyJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      setTimeout(() => {
        if (copiedId === id) copiedId = "";
      }, 1400);
    } catch {
      copiedId = "";
    }
  }

  async function loadConfig(force = false) {
    if (!active || !supportsHooks || !component || !name) return;
    const contextKey = instanceKey;
    if (!force && loadedKey === contextKey) return;
    const req = ++requestSeq;
    loading = true;
    error = null;
    try {
      const result = await api.getConfig(component, name);
      if (req !== requestSeq || contextKey !== instanceKey || !active) return;
      config = typeof result === "string" ? JSON.parse(result) : result;
      loadedKey = contextKey;
    } catch (err) {
      if (req !== requestSeq || contextKey !== instanceKey || !active) return;
      config = null;
      error = (err as Error).message || "Failed to load hooks config.";
    } finally {
      if (req === requestSeq && contextKey === instanceKey) loading = false;
    }
  }

  $effect(() => {
    if (!active || !supportsHooks) return;
    void loadConfig();
  });
</script>

<section class="hooks-panel">
  {#if !supportsHooks}
    <div class="panel-state warning">Hooks are only supported for NullClaw instances.</div>
  {:else}
    <div class="panel-header">
      <div>
        <h2>Hooks</h2>
        <p>Runtime hooks, diagnostics, and standard templates for this NullClaw instance.</p>
      </div>
      <button class="btn" onclick={() => loadConfig(true)} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh"}
      </button>
    </div>

    {#if error}
      <div class="panel-state warning">{error}</div>
    {/if}

    <div class="summary-grid">
      <div class="summary-card">
        <span class="label">State</span>
        <strong class:enabled={hooksConfig?.enabled}>{hooksConfig?.enabled ? "Enabled" : "Disabled"}</strong>
      </div>
      <div class="summary-card">
        <span class="label">Handlers</span>
        <strong>{configuredHandlers.length}</strong>
      </div>
      <div class="summary-card">
        <span class="label">Default Timeout</span>
        <strong>{hooksConfig?.default_timeout_ms || 5000}ms</strong>
      </div>
      <div class="summary-card">
        <span class="label">On Error</span>
        <strong>{hooksConfig?.default_on_error || "warn"}</strong>
      </div>
      <div class="summary-card wide">
        <span class="label">Diagnostics</span>
        <strong>{diagnostics?.enabled === false ? "Off" : "On"}</strong>
        <span class="muted">{diagnostics?.events_file || ".nullclaw/hooks/events.ndjson"}</span>
      </div>
    </div>

    <div class="section-block">
      <div class="section-title">
        <h3>Configured Handlers</h3>
        <span>{configuredHandlers.length} installed</span>
      </div>
      {#if configuredHandlers.length === 0}
        <div class="panel-state">No hook handlers configured in this instance config.</div>
      {:else}
        <div class="handler-table" role="table" aria-label="Configured hook handlers">
          <div class="handler-row header" role="row">
            <span>ID</span>
            <span>Event</span>
            <span>Command</span>
            <span>Policy</span>
          </div>
          {#each configuredHandlers as handler}
            <div class="handler-row" role="row">
              <span class="mono">{handler.id || "-"}</span>
              <span>
                <span class="event-pill">{handler.event || "-"}</span>
                <small>{eventState(handler.event || "")}</small>
              </span>
              <span class="command mono">{handler.command || "-"}</span>
              <span>
                <span>{handler.enabled === false ? "disabled" : "enabled"}</span>
                <small>{handler.on_error || hooksConfig?.default_on_error || "warn"}</small>
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="section-block">
      <div class="section-title">
        <h3>Hook Gallery</h3>
        <span>{filteredTemplates.length} templates</span>
      </div>
      <div class="gallery-controls">
        <input bind:value={query} placeholder="Search hooks" />
        <select bind:value={category}>
          {#each categories as item}
            <option value={item}>{item}</option>
          {/each}
        </select>
      </div>
      <div class="gallery-grid">
        {#each filteredTemplates as item}
          <article class="template-card">
            <div class="template-head">
              <div>
                <span class="category">{item.category}</span>
                <h4>{item.title}</h4>
              </div>
              <span class:wired={wiredEvents.has(item.event)} class="event-state">{eventState(item.event)}</span>
            </div>
            <p>{item.goal}</p>
            <div class="template-meta">
              <span><b>Event</b><code>{item.event}</code></span>
              <span><b>Output</b><code>{item.output}</code></span>
              <span><b>Error</b><code>{item.on_error}</code></span>
            </div>
            <pre><code>{prettyJson(templateHandler(item))}</code></pre>
            <button class="btn subtle" onclick={() => copyText(item.id, prettyJson(templateHandler(item)))}>
              {copiedId === item.id ? "Copied" : "Copy Handler JSON"}
            </button>
          </article>
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .hooks-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .panel-header,
  .section-title {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  h2,
  h3,
  h4,
  p {
    margin: 0;
  }
  .panel-header p,
  .template-card p,
  .muted,
  small,
  .section-title span {
    color: var(--fg-dim);
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 1rem;
  }
  .summary-card,
  .section-block,
  .template-card,
  .panel-state {
    border: 1px solid var(--border);
    background: var(--bg-surface);
    border-radius: 4px;
  }
  .summary-card {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 1rem;
  }
  .summary-card.wide {
    min-width: 260px;
  }
  .label,
  .category,
  .handler-row.header {
    color: var(--fg-dim);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  strong.enabled,
  .event-state.wired {
    color: var(--accent);
  }
  .section-block {
    padding: 1.25rem;
  }
  .panel-state {
    padding: 1rem;
    color: var(--fg-dim);
  }
  .panel-state.warning {
    border-color: color-mix(in srgb, var(--warning, #777777) 50%, var(--border));
    color: var(--warning, #777777);
  }
  .handler-table {
    margin-top: 1rem;
    display: grid;
    gap: 0.5rem;
  }
  .handler-row {
    display: grid;
    grid-template-columns: minmax(120px, 0.9fr) minmax(130px, 0.8fr) minmax(220px, 1.5fr) minmax(100px, 0.6fr);
    gap: 1rem;
    align-items: center;
    padding: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
    border-radius: 3px;
  }
  .handler-row.header {
    border: none;
    padding-bottom: 0.25rem;
  }
  .handler-row small,
  .handler-row span {
    min-width: 0;
  }
  .command {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mono,
  code,
  pre {
    font-family: var(--font-mono);
  }
  .event-pill,
  .event-state {
    display: inline-flex;
    width: fit-content;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 0.72rem;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }
  .gallery-controls {
    display: flex;
    gap: 0.75rem;
    margin: 1rem 0;
  }
  .gallery-controls input,
  .gallery-controls select {
    min-height: 2.4rem;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    border-radius: 3px;
    padding: 0.55rem 0.75rem;
    font-family: var(--font-mono);
  }
  .gallery-controls input {
    flex: 1;
  }
  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
    gap: 1rem;
  }
  .template-card {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding: 1rem;
  }
  .template-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .template-meta {
    display: grid;
    gap: 0.4rem;
  }
  .template-meta span {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .template-meta b {
    color: var(--fg-dim);
    font-size: 0.75rem;
    text-transform: uppercase;
  }
  pre {
    max-height: 180px;
    overflow: auto;
    margin: 0;
    padding: 0.75rem;
    background: var(--bg);
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    border-radius: 3px;
    font-size: 0.75rem;
    white-space: pre-wrap;
  }
  .btn {
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    cursor: pointer;
  }
  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .btn.subtle {
    width: fit-content;
    background: transparent;
  }
  @media (max-width: 820px) {
    .panel-header,
    .section-title,
    .gallery-controls {
      flex-direction: column;
    }
    .handler-row {
      grid-template-columns: 1fr;
    }
  }
</style>
