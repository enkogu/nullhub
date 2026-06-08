<script lang="ts">
  import {
    api,
    type McpMutationResult,
    type McpServerDraft,
    type McpServerSummary,
  } from "$lib/api/client";
  import {
    describeInstanceCliError,
    isInstanceCliError,
  } from "$lib/instanceCli";
  import {
    buildMcpServerDraft,
    createEmptyMcpDraft,
    describeMcpMutationResult,
    hydrateMcpEditorState,
  } from "$lib/mcpEditor.js";

  let { component, name, active = false } = $props<{
    component: string;
    name: string;
    active?: boolean;
  }>();

  type EditorMode = "create" | "edit";

  let servers = $state<McpServerSummary[]>([]);
  let selectedName = $state("");
  let selectedDetail = $state<McpServerSummary | null>(null);
  let loading = $state(false);
  let detailLoading = $state(false);
  let busyAction = $state<string | null>(null);
  let error = $state<string | null>(null);
  let detailError = $state<string | null>(null);
  let actionMessage = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let editorOpen = $state(false);
  let editorMode = $state<EditorMode>("create");
  let originalName = $state("");
  let draft = $state<McpServerDraft>(createEmptyMcpDraft());
  let envText = $state("");
  let headerText = $state("");
  let argsText = $state("");
  let replaceEnv = $state(false);
  let replaceHeaders = $state(false);
  let loadedKey = $state("");
  let requestSeq = 0;
  let detailSeq = 0;

  const instanceKey = $derived(`${component}/${name}`);
  const supportsMcp = $derived(component === "nullclaw");
  const sortedServers = $derived([...servers].sort((a, b) => a.name.localeCompare(b.name)));
  const selectedServer = $derived(
    sortedServers.find((server) => server.name === selectedName) || null,
  );
  const enabledCount = $derived(sortedServers.length);
  const toolTotal = $derived(
    sortedServers.reduce((sum, server) => sum + (typeof server.tool_count === "number" ? server.tool_count : 0), 0),
  );

  function hydrateEditor(server?: McpServerSummary) {
    const next = hydrateMcpEditorState(server);
    draft = next.draft;
    argsText = next.argsText;
    envText = next.envText;
    headerText = next.headerText;
    replaceEnv = next.replaceEnv;
    replaceHeaders = next.replaceHeaders;
  }

  function buildDraft(): McpServerDraft {
    return buildMcpServerDraft(draft, {
      argsText,
      envText,
      headerText,
      replaceEnv,
      replaceHeaders,
    }) as McpServerDraft;
  }

  function describeResult(result: McpMutationResult, fallback: string): string {
    return describeMcpMutationResult(result, fallback);
  }

  async function loadServers(force = false) {
    if (!active || !supportsMcp || !component || !name) return;
    const contextKey = instanceKey;
    if (!force && loadedKey === contextKey) return;
    const req = ++requestSeq;
    loading = true;
    error = null;
    try {
      const result = await api.getMcpServers(component, name);
      if (req !== requestSeq || contextKey !== instanceKey || !active) return;
      if (isInstanceCliError(result)) {
        servers = [];
        error = describeInstanceCliError(result, "MCP servers are unavailable.");
      } else {
        servers = Array.isArray(result) ? result : [];
        if (!selectedName && servers.length > 0) selectedName = servers[0].name;
      }
      loadedKey = contextKey;
    } catch (err) {
      if (req !== requestSeq || contextKey !== instanceKey || !active) return;
      servers = [];
      error = (err as Error).message || "Failed to load MCP servers.";
    } finally {
      if (req === requestSeq && contextKey === instanceKey) loading = false;
    }
  }

  async function loadDetail(serverName: string, force = false) {
    if (!active || !supportsMcp || !serverName) return;
    if (!force && selectedDetail?.name === serverName) return;
    const contextKey = instanceKey;
    const req = ++detailSeq;
    detailLoading = true;
    detailError = null;
    try {
      const result = await api.getMcpServer(component, name, serverName);
      if (req !== detailSeq || contextKey !== instanceKey || !active) return;
      if (isInstanceCliError(result)) {
        selectedDetail = null;
        detailError = describeInstanceCliError(result, "MCP server detail is unavailable.");
      } else {
        selectedDetail = result;
      }
    } catch (err) {
      if (req !== detailSeq || contextKey !== instanceKey || !active) return;
      selectedDetail = null;
      detailError = (err as Error).message || "Failed to load MCP server detail.";
    } finally {
      if (req === detailSeq && contextKey === instanceKey) detailLoading = false;
    }
  }

  async function refreshAll() {
    loadedKey = "";
    await loadServers(true);
    if (selectedName) await loadDetail(selectedName, true);
  }

  function openCreate() {
    editorMode = "create";
    originalName = "";
    hydrateEditor();
    editorOpen = true;
    actionError = null;
    actionMessage = null;
  }

  async function openEdit(serverName: string) {
    editorMode = "edit";
    originalName = serverName;
    actionError = null;
    actionMessage = null;
    try {
      const detail = selectedDetail?.name === serverName ? selectedDetail : await api.getMcpServer(component, name, serverName);
      hydrateEditor(detail);
      editorOpen = true;
    } catch (err) {
      actionError = (err as Error).message || `Failed to load ${serverName}.`;
    }
  }

  async function submitEditor() {
    const payload = buildDraft();
    if (!payload.name) {
      actionError = "Name is required.";
      return;
    }
    if (payload.transport === "stdio" && !payload.command) {
      actionError = "Command is required for stdio servers.";
      return;
    }
    if (payload.transport === "http" && !payload.url) {
      actionError = "URL is required for HTTP servers.";
      return;
    }

    busyAction = "save";
    actionError = null;
    actionMessage = null;
    try {
      await api.validateMcpServer(component, name, payload);
      const result =
        editorMode === "create"
          ? await api.createMcpServer(component, name, payload)
          : await api.updateMcpServer(component, name, originalName || payload.name, payload);
      actionMessage = describeResult(result, editorMode === "create" ? "MCP server created." : "MCP server updated.");
      editorOpen = false;
      selectedName = payload.name;
      await refreshAll();
    } catch (err) {
      actionError = (err as Error).message || "Failed to save MCP server.";
    } finally {
      busyAction = null;
    }
  }

  async function deleteServer(serverName: string) {
    if (!window.confirm(`Delete MCP server "${serverName}"?`)) return;
    busyAction = `delete:${serverName}`;
    actionError = null;
    actionMessage = null;
    try {
      const result = await api.deleteMcpServer(component, name, serverName);
      actionMessage = describeResult(result, "MCP server deleted.");
      if (selectedName === serverName) {
        selectedName = "";
        selectedDetail = null;
      }
      await refreshAll();
    } catch (err) {
      actionError = (err as Error).message || `Failed to delete ${serverName}.`;
    } finally {
      busyAction = null;
    }
  }

  async function probeServer(serverName: string) {
    busyAction = `probe:${serverName}`;
    actionError = null;
    actionMessage = null;
    try {
      selectedDetail = await api.probeMcpServer(component, name, serverName);
      selectedName = serverName;
      actionMessage = `Probe completed for ${serverName}.`;
    } catch (err) {
      actionError = (err as Error).message || `Failed to probe ${serverName}.`;
    } finally {
      busyAction = null;
    }
  }

  async function reloadMcp() {
    busyAction = "reload";
    actionError = null;
    actionMessage = null;
    try {
      const result = await api.reloadMcp(component, name);
      actionMessage = result?.message || (result?.reloaded ? "Config reload requested." : "Reload request completed.");
    } catch (err) {
      actionError = (err as Error).message || "Failed to reload MCP config.";
    } finally {
      busyAction = null;
    }
  }

  function selectServerFromKeyboard(event: KeyboardEvent, serverName: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectedName = serverName;
  }

  $effect(() => {
    if (!active || !supportsMcp || !component || !name) return;
    if (loadedKey === instanceKey) return;
    servers = [];
    selectedName = "";
    selectedDetail = null;
    void loadServers(true);
  });

  $effect(() => {
    if (!active || !supportsMcp || !selectedName) return;
    void loadDetail(selectedName);
  });
</script>

<div class="mcp-panel">
  <div class="panel-toolbar">
    <div>
      <h2>MCP Servers</h2>
      <p>Configured Model Context Protocol servers for this NullClaw instance.</p>
    </div>
    <div class="toolbar-actions">
      <button class="toolbar-btn" onclick={() => void refreshAll()} disabled={loading || busyAction !== null}>Refresh</button>
      <button class="toolbar-btn" onclick={() => void reloadMcp()} disabled={busyAction !== null}>Reload</button>
      <button class="toolbar-btn primary" onclick={openCreate} disabled={!supportsMcp || busyAction !== null}>Add</button>
    </div>
  </div>

  {#if !supportsMcp}
    <div class="panel-state warning">MCP management is only supported for NullClaw instances.</div>
  {:else}
    <div class="summary-strip">
      <div><span class="metric">{enabledCount}</span><span>servers</span></div>
      <div><span class="metric">{toolTotal}</span><span>known tools</span></div>
      <div><span class="metric">{sortedServers.filter((server) => server.transport === "http").length}</span><span>HTTP</span></div>
      <div><span class="metric">{sortedServers.filter((server) => server.transport !== "http").length}</span><span>stdio</span></div>
    </div>

    {#if actionMessage}
      <div class="panel-state success">{actionMessage}</div>
    {/if}
    {#if actionError}
      <div class="panel-state warning">{actionError}</div>
    {/if}
    {#if error}
      <div class="panel-state warning">{error}</div>
    {:else if loading && sortedServers.length === 0}
      <div class="panel-state">Loading MCP servers...</div>
    {:else if sortedServers.length === 0}
      <div class="panel-state">No MCP servers configured.</div>
    {:else}
      <div class="mcp-layout">
        <div class="server-table" role="table" aria-label="MCP servers">
          <div class="table-row table-head" role="row">
            <span>Name</span>
            <span>Transport</span>
            <span>Endpoint</span>
            <span>Tools</span>
            <span></span>
          </div>
          {#each sortedServers as server}
            <div
              class:active={server.name === selectedName}
              class="table-row"
              role="row"
              tabindex="0"
              onclick={() => (selectedName = server.name)}
              onkeydown={(event) => selectServerFromKeyboard(event, server.name)}
            >
              <span class="server-name">{server.name}</span>
              <span><span class="badge">{server.transport || "stdio"}</span></span>
              <span class="server-endpoint">{server.transport === "http" ? server.url || "-" : server.command || "-"}</span>
              <span>{typeof server.tool_count === "number" ? server.tool_count : "-"}</span>
              <span class="row-actions">
                <button type="button" onclick={(event) => { event.stopPropagation(); void probeServer(server.name); }} disabled={busyAction !== null}>Probe</button>
                <button type="button" onclick={(event) => { event.stopPropagation(); void openEdit(server.name); }} disabled={busyAction !== null}>Edit</button>
                <button type="button" class="danger" onclick={(event) => { event.stopPropagation(); void deleteServer(server.name); }} disabled={busyAction !== null}>Delete</button>
              </span>
            </div>
          {/each}
        </div>

        <aside class="detail-panel">
          {#if !selectedServer}
            <div class="panel-state">Select a server to inspect it.</div>
          {:else if detailLoading}
            <div class="panel-state">Loading detail...</div>
          {:else if detailError}
            <div class="panel-state warning">{detailError}</div>
          {:else}
            <header>
              <div>
                <h3>{selectedDetail?.name || selectedServer.name}</h3>
                <p>{selectedDetail?.transport || selectedServer.transport || "stdio"}</p>
              </div>
              <span class="badge">{typeof selectedDetail?.tool_count === "number" ? `${selectedDetail.tool_count} tools` : "tools unknown"}</span>
            </header>
            <dl>
              <dt>Command</dt>
              <dd>{selectedDetail?.command || selectedServer.command || "-"}</dd>
              <dt>URL</dt>
              <dd>{selectedDetail?.url || selectedServer.url || "-"}</dd>
              <dt>Args</dt>
              <dd>{Array.isArray(selectedDetail?.args) ? selectedDetail?.args?.join(" ") : selectedServer.args_count || 0}</dd>
              <dt>Env Keys</dt>
              <dd>{(selectedDetail?.env_keys || selectedServer.env_keys || []).join(", ") || "-"}</dd>
              <dt>Headers</dt>
              <dd>{(selectedDetail?.header_names || selectedServer.header_names || []).join(", ") || "-"}</dd>
              <dt>Timeout</dt>
              <dd>{selectedDetail?.timeout_ms || selectedServer.timeout_ms || "-"} ms</dd>
            </dl>
          {/if}
        </aside>
      </div>
    {/if}
  {/if}

  {#if editorOpen}
    <div class="editor-shell" role="dialog" aria-modal="true" aria-label="MCP server editor">
      <div class="editor">
        <header>
          <h3>{editorMode === "create" ? "Add MCP Server" : "Edit MCP Server"}</h3>
          <button class="icon-btn" onclick={() => (editorOpen = false)} aria-label="Close editor">x</button>
        </header>

        <div class="form-grid">
          <label>
            <span>Name</span>
            <input bind:value={draft.name} disabled={editorMode === "edit"} placeholder="context7" />
          </label>
          <label>
            <span>Transport</span>
            <select bind:value={draft.transport}>
              <option value="stdio">stdio</option>
              <option value="http">http</option>
            </select>
          </label>
          {#if draft.transport === "stdio"}
            <label class="wide">
              <span>Command</span>
              <input bind:value={draft.command} placeholder="npx" />
            </label>
            <label class="wide">
              <span>Args</span>
              <textarea bind:value={argsText} rows="4" placeholder="-y&#10;@upstash/context7-mcp"></textarea>
            </label>
          {:else}
            <label class="wide">
              <span>URL</span>
              <input bind:value={draft.url} placeholder="http://localhost:8931/mcp" />
            </label>
            <label class="wide">
              <span>Headers</span>
              <textarea bind:value={headerText} rows="4" placeholder={'Authorization=Bearer ${MCP_TOKEN}'}></textarea>
            </label>
            {#if editorMode === "edit"}
              <label class="wide checkbox-row">
                <input type="checkbox" bind:checked={replaceHeaders} />
                <span>Replace Stored Headers</span>
              </label>
            {/if}
          {/if}
          <label>
            <span>Timeout ms</span>
            <input type="number" min="0" step="1000" bind:value={draft.timeout_ms} />
          </label>
          <label class="wide">
            <span>Environment</span>
            <textarea bind:value={envText} rows="4" placeholder={'CONTEXT7_API_KEY=${CONTEXT7_API_KEY}'}></textarea>
          </label>
          {#if editorMode === "edit"}
            <label class="wide checkbox-row">
              <input type="checkbox" bind:checked={replaceEnv} />
              <span>Replace Stored Env</span>
            </label>
          {/if}
        </div>

        <footer>
          <button class="toolbar-btn" onclick={() => (editorOpen = false)} disabled={busyAction !== null}>Cancel</button>
          <button class="toolbar-btn primary" onclick={() => void submitEditor()} disabled={busyAction !== null}>
            {busyAction === "save" ? "Saving..." : "Save"}
          </button>
        </footer>
      </div>
    </div>
  {/if}
</div>

<style>
  .mcp-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .panel-toolbar,
  .detail-panel header,
  .editor header,
  .editor footer {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  .panel-toolbar h2,
  .detail-panel h3,
  .editor h3 {
    margin: 0;
    color: var(--accent);
  }
  .panel-toolbar p,
  .detail-panel p {
    margin: 0.25rem 0 0;
    color: var(--fg-dim);
    font-size: 0.85rem;
  }
  .toolbar-actions,
  .row-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .toolbar-btn,
  .row-actions button,
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.25rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--accent-dim);
    background: var(--bg-surface);
    color: var(--accent);
    border-radius: 3px;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }
  .toolbar-btn.primary {
    background: color-mix(in srgb, var(--accent) 12%, var(--bg-surface));
  }
  .toolbar-btn:disabled,
  .row-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .row-actions button.danger {
    border-color: color-mix(in srgb, var(--error) 55%, transparent);
    color: var(--error);
  }
  .summary-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.75rem;
  }
  .summary-strip > div {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.85rem;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    border-radius: 4px;
  }
  .metric {
    color: var(--accent);
    font-size: 1.35rem;
    font-weight: 800;
  }
  .panel-state {
    padding: 1rem;
    border: 1px dashed var(--border);
    background: var(--bg-surface);
    color: var(--fg-dim);
    border-radius: 4px;
    text-align: center;
  }
  .panel-state.warning {
    border-color: color-mix(in srgb, var(--warning) 55%, transparent);
    color: var(--warning);
  }
  .panel-state.success {
    border-color: color-mix(in srgb, var(--success, #22c55e) 55%, transparent);
    color: var(--success, #22c55e);
  }
  .mcp-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
    gap: 1rem;
  }
  .server-table,
  .detail-panel,
  .editor {
    border: 1px solid var(--border);
    background: var(--bg-surface);
    border-radius: 4px;
  }
  .table-row {
    display: grid;
    grid-template-columns: minmax(120px, 0.9fr) 110px minmax(160px, 1.2fr) 80px minmax(220px, auto);
    width: 100%;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem;
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
    background: transparent;
    color: var(--fg);
    text-align: left;
    font: inherit;
  }
  .table-row:not(.table-head) {
    cursor: pointer;
  }
  .table-row.active,
  .table-row:not(.table-head):hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .table-head {
    color: var(--fg-dim);
    font-size: 0.74rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .server-name,
  .server-endpoint,
  dd {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .server-name {
    font-weight: 800;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    min-height: 1.5rem;
    padding: 0.15rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--fg-dim);
    font-size: 0.72rem;
  }
  .detail-panel {
    padding: 1rem;
  }
  dl {
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr);
    gap: 0.65rem 0.8rem;
    margin: 1rem 0 0;
  }
  dt {
    color: var(--fg-dim);
    font-size: 0.75rem;
    text-transform: uppercase;
  }
  dd {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.82rem;
  }
  .editor-shell {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.55);
  }
  .editor {
    width: min(720px, 100%);
    max-height: calc(100vh - 2rem);
    overflow: auto;
    padding: 1rem;
  }
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem;
    margin: 1rem 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    color: var(--fg-dim);
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
  }
  label.wide {
    grid-column: 1 / -1;
  }
  label.checkbox-row {
    flex-direction: row;
    align-items: center;
    gap: 0.55rem;
  }
  label.checkbox-row input {
    width: auto;
    min-width: 1rem;
  }
  input,
  select,
  textarea {
    width: 100%;
    padding: 0.65rem;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    border-radius: 3px;
    font: inherit;
    font-family: var(--font-mono);
    font-size: 0.86rem;
  }
  textarea {
    resize: vertical;
  }
  @media (max-width: 900px) {
    .mcp-layout,
    .form-grid {
      grid-template-columns: 1fr;
    }
    .table-row {
      grid-template-columns: 1fr;
    }
    .table-head {
      display: none;
    }
    .row-actions {
      justify-content: flex-start;
    }
  }
</style>
