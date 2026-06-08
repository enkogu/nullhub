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
  import { Card } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Select } from "$lib/components/ui/select";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Label } from "$lib/components/ui/label";
  import { Badge } from "$lib/components/ui/badge";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import RotateCwIcon from "@lucide/svelte/icons/rotate-cw";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import XIcon from "@lucide/svelte/icons/x";

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
      <Button variant="outline" size="icon" onclick={() => void refreshAll()} disabled={loading || busyAction !== null} title="Refresh" aria-label="Refresh servers">
        <RefreshCwIcon />
      </Button>
      <Button variant="outline" size="icon" onclick={() => void reloadMcp()} disabled={busyAction !== null} title="Reload config" aria-label="Reload MCP config">
        <RotateCwIcon />
      </Button>
      <Button variant="default" size="icon" onclick={openCreate} disabled={!supportsMcp || busyAction !== null} title="Add server" aria-label="Add MCP server">
        <PlusIcon />
      </Button>
    </div>
  </div>

  {#if !supportsMcp}
    <div class="panel-state warning">MCP management is only supported for NullClaw instances.</div>
  {:else}
    <div class="summary-strip">
      <Card class="summary-item px-5"><span class="metric">{enabledCount}</span><span>servers</span></Card>
      <Card class="summary-item px-5"><span class="metric">{toolTotal}</span><span>known tools</span></Card>
      <Card class="summary-item px-5"><span class="metric">{sortedServers.filter((server) => server.transport === "http").length}</span><span>HTTP</span></Card>
      <Card class="summary-item px-5"><span class="metric">{sortedServers.filter((server) => server.transport !== "http").length}</span><span>stdio</span></Card>
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
        <Card class="server-table px-0" role="table" aria-label="MCP servers">
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
              <span><Badge variant="secondary">{server.transport || "stdio"}</Badge></span>
              <span class="server-endpoint mono">{server.transport === "http" ? server.url || "-" : server.command || "-"}</span>
              <span>{typeof server.tool_count === "number" ? server.tool_count : "-"}</span>
              <span class="row-actions">
                <Button variant="ghost" size="icon-sm" onclick={(event) => { event.stopPropagation(); void probeServer(server.name); }} disabled={busyAction !== null} title="Probe" aria-label={`Probe ${server.name}`}>
                  <ActivityIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" onclick={(event) => { event.stopPropagation(); void openEdit(server.name); }} disabled={busyAction !== null} title="Edit" aria-label={`Edit ${server.name}`}>
                  <PencilIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" class="danger-icon" onclick={(event) => { event.stopPropagation(); void deleteServer(server.name); }} disabled={busyAction !== null} title="Delete" aria-label={`Delete ${server.name}`}>
                  <Trash2Icon />
                </Button>
              </span>
            </div>
          {/each}
        </Card>

        <Card class="detail-panel px-5">
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
              <Badge variant="outline">{typeof selectedDetail?.tool_count === "number" ? `${selectedDetail.tool_count} tools` : "tools unknown"}</Badge>
            </header>
            <dl>
              <dt>Command</dt>
              <dd>{selectedDetail?.command || selectedServer.command || "-"}</dd>
              <dt>URL</dt>
              <dd>{selectedDetail?.url || selectedServer.url || "-"}</dd>
              <dt>Args</dt>
              <dd>{Array.isArray(selectedDetail?.args) ? selectedDetail?.args?.join(" ") : selectedServer.args_count || 0}</dd>
              <dt>Env keys</dt>
              <dd>{(selectedDetail?.env_keys || selectedServer.env_keys || []).join(", ") || "-"}</dd>
              <dt>Headers</dt>
              <dd>{(selectedDetail?.header_names || selectedServer.header_names || []).join(", ") || "-"}</dd>
              <dt>Timeout</dt>
              <dd>{selectedDetail?.timeout_ms || selectedServer.timeout_ms || "-"} ms</dd>
            </dl>
          {/if}
        </Card>
      </div>
    {/if}
  {/if}

  {#if editorOpen}
    <div class="editor-shell" role="dialog" aria-modal="true" aria-label="MCP server editor">
      <Card class="editor px-5">
        <header>
          <h3>{editorMode === "create" ? "Add MCP server" : "Edit MCP server"}</h3>
          <Button variant="ghost" size="icon-sm" onclick={() => (editorOpen = false)} title="Close" aria-label="Close editor">
            <XIcon />
          </Button>
        </header>

        <div class="form-grid">
          <div class="field">
            <Label for="mcp-name">Name</Label>
            <Input id="mcp-name" bind:value={draft.name} disabled={editorMode === "edit"} placeholder="context7" />
          </div>
          <div class="field">
            <Label for="mcp-transport">Transport</Label>
            <Select id="mcp-transport" bind:value={draft.transport}>
              <option value="stdio">stdio</option>
              <option value="http">http</option>
            </Select>
          </div>
          {#if draft.transport === "stdio"}
            <div class="field wide">
              <Label for="mcp-command">Command</Label>
              <Input id="mcp-command" bind:value={draft.command} placeholder="npx" />
            </div>
            <div class="field wide">
              <Label for="mcp-args">Args</Label>
              <Textarea id="mcp-args" class="mono-input" bind:value={argsText} rows={4} placeholder={"-y\n@upstash/context7-mcp"}></Textarea>
            </div>
          {:else}
            <div class="field wide">
              <Label for="mcp-url">URL</Label>
              <Input id="mcp-url" bind:value={draft.url} placeholder="http://localhost:8931/mcp" />
            </div>
            <div class="field wide">
              <Label for="mcp-headers">Headers</Label>
              <Textarea id="mcp-headers" class="mono-input" bind:value={headerText} rows={4} placeholder={'Authorization=Bearer ${MCP_TOKEN}'}></Textarea>
            </div>
            {#if editorMode === "edit"}
              <label class="wide checkbox-row">
                <input type="checkbox" bind:checked={replaceHeaders} />
                <span>Replace stored headers</span>
              </label>
            {/if}
          {/if}
          <div class="field">
            <Label for="mcp-timeout">Timeout ms</Label>
            <Input id="mcp-timeout" type="number" min="0" step="1000" bind:value={draft.timeout_ms} />
          </div>
          <div class="field wide">
            <Label for="mcp-env">Environment</Label>
            <Textarea id="mcp-env" class="mono-input" bind:value={envText} rows={4} placeholder={'CONTEXT7_API_KEY=${CONTEXT7_API_KEY}'}></Textarea>
          </div>
          {#if editorMode === "edit"}
            <label class="wide checkbox-row">
              <input type="checkbox" bind:checked={replaceEnv} />
              <span>Replace stored env</span>
            </label>
          {/if}
        </div>

        <footer>
          <Button variant="outline" onclick={() => (editorOpen = false)} disabled={busyAction !== null}>Cancel</Button>
          <Button variant="default" onclick={() => void submitEditor()} disabled={busyAction !== null}>
            {busyAction === "save" ? "Saving..." : "Save"}
          </Button>
        </footer>
      </Card>
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
  :global(.detail-panel) header,
  :global(.editor) header,
  :global(.editor) footer {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  .panel-toolbar h2,
  :global(.detail-panel) h3,
  :global(.editor) h3 {
    margin: 0;
    color: var(--shadcn-foreground);
    font-weight: 600;
  }
  .panel-toolbar h2 {
    font-size: 1.1rem;
  }
  :global(.detail-panel) h3,
  :global(.editor) h3 {
    font-size: 1rem;
  }
  .panel-toolbar p,
  :global(.detail-panel) p {
    margin: 0.25rem 0 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.85rem;
  }
  .toolbar-actions,
  .row-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  :global(.danger-icon) {
    color: var(--shadcn-destructive);
  }
  :global(.danger-icon:hover) {
    color: var(--shadcn-destructive);
  }
  .summary-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.75rem;
  }
  :global(.summary-item) {
    flex-direction: row;
    align-items: baseline;
    gap: 0.4rem;
  }
  .metric {
    color: var(--shadcn-foreground);
    font-size: 1.35rem;
    font-weight: 700;
  }
  :global(.summary-item > span:not(.metric)) {
    color: var(--shadcn-muted-foreground);
    font-size: 0.85rem;
  }
  .panel-state {
    padding: 1rem;
    border: 1px dashed var(--shadcn-border);
    background: var(--shadcn-muted);
    color: var(--shadcn-muted-foreground);
    border-radius: var(--shadcn-radius);
    text-align: center;
  }
  .panel-state.warning {
    border-color: color-mix(in srgb, var(--shadcn-destructive) 35%, var(--shadcn-border));
    color: var(--shadcn-destructive);
    background: color-mix(in srgb, var(--shadcn-destructive) 6%, var(--shadcn-card));
  }
  .panel-state.success {
    border-color: color-mix(in srgb, #16a34a 35%, var(--shadcn-border));
    color: #166534;
    background: color-mix(in srgb, #16a34a 6%, var(--shadcn-card));
  }
  .mcp-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
    gap: 1rem;
  }
  :global(.server-table) {
    gap: 0;
    overflow: hidden;
  }
  .table-row {
    display: grid;
    grid-template-columns: minmax(120px, 0.9fr) 110px minmax(160px, 1.2fr) 80px minmax(150px, auto);
    width: 100%;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem 1.25rem;
    border: 0;
    border-bottom: 1px solid var(--shadcn-border);
    background: transparent;
    color: var(--shadcn-foreground);
    text-align: left;
  }
  .table-row:last-child {
    border-bottom: 0;
  }
  .table-row:not(.table-head) {
    cursor: pointer;
  }
  .table-row.active,
  .table-row:not(.table-head):hover {
    background: var(--shadcn-accent);
  }
  .table-head {
    color: var(--shadcn-muted-foreground);
    font-size: 0.74rem;
    font-weight: 500;
  }
  .server-name,
  .server-endpoint,
  dd {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .server-name {
    font-weight: 600;
  }
  dl {
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr);
    gap: 0.65rem 0.8rem;
    margin: 1rem 0 0;
  }
  dt {
    color: var(--shadcn-muted-foreground);
    font-size: 0.78rem;
  }
  dd {
    margin: 0;
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.82rem;
    color: var(--shadcn-foreground);
  }
  .editor-shell {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.4);
  }
  :global(.editor) {
    width: min(720px, 100%);
    max-height: calc(100vh - 2rem);
    overflow: auto;
  }
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem;
    margin: 1rem 0;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .field.wide,
  .checkbox-row.wide {
    grid-column: 1 / -1;
  }
  .checkbox-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.55rem;
    color: var(--shadcn-foreground);
    font-size: 0.85rem;
  }
  .checkbox-row input {
    width: auto;
    min-width: 1rem;
  }
  :global(.mono-input) {
    font-family: var(--prin7r-font-mono-standard);
  }
  .mono {
    font-family: var(--prin7r-font-mono-standard);
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
