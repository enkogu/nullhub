<script lang="ts">
  import { page } from "$app/stores";
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { pollWhileVisible } from "$lib/poll";
  import NullClawChatSurface from "$lib/components/NullClawChatSurface.svelte";
  import { Badge, type BadgeVariant } from "$lib/components/ui/badge";
  import { Select } from "$lib/components/ui/select";

  type AgentOption = {
    name: string;
    status: string;
    version?: string;
    port?: number;
  };

  const LAST_AGENT_KEY = "nullhub:agent-chat:last-agent:v1";
  const OPEN_KEY = "nullhub:agent-chat:open:v1";
  const statusVariants: Record<string, BadgeVariant> = {
    running: "success",
    starting: "warning",
    restarting: "warning",
    stopping: "warning",
    stopped: "muted",
    failed: "destructive",
  };

  let { open = $bindable(false) } = $props<{ open?: boolean }>();
  let agents = $state<AgentOption[]>([]);
  let selectedAgentName = $state("");
  let statusLoading = $state(false);
  let statusError = $state("");
  let stopStatusPolling: (() => void) | null = null;
  let lastLoadedAt = 0;
  let statusRequestSeq = 0;
  let storageReady = false;

  const routeAgentName = $derived(agentNameFromRoute($page.url.pathname));
  const selectedAgent = $derived(
    agents.find((agent) => agent.name === selectedAgentName) || null,
  );
  const selectedStatusVariant = $derived(
    statusVariants[selectedAgent?.status || ""] || "muted",
  );
  const drawerDisabledReason = $derived(
    !selectedAgent
      ? ""
      : selectedAgent.status === "running"
        ? ""
        : `Agent is ${selectedAgent.status || "not running"}.`,
  );

  function safeLocalStorageGet(key: string): string {
    if (!browser) return "";
    try {
      return localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function safeLocalStorageSet(key: string, value: string) {
    if (!browser) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore storage failures */
    }
  }

  function agentNameFromRoute(path: string): string {
    const parts = path.split("/");
    if (parts[1] !== "instances" || parts[2] !== "nullclaw" || !parts[3]) return "";
    try {
      return decodeURIComponent(parts[3]);
    } catch {
      return parts[3];
    }
  }

  function sortAgents(list: AgentOption[]): AgentOption[] {
    return [...list].sort((a, b) => {
      const aRunning = a.status === "running" ? 0 : 1;
      const bRunning = b.status === "running" ? 0 : 1;
      if (aRunning !== bRunning) return aRunning - bRunning;
      return a.name.localeCompare(b.name);
    });
  }

  function titleCaseIdentifier(value: string): string {
    return value
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function formatAgentName(name: string): string {
    return titleCaseIdentifier(name) || "Agent";
  }

  function formatAgentLabel(agent: AgentOption): string {
    return agent.port ? `${formatAgentName(agent.name)} · ${agent.port}` : formatAgentName(agent.name);
  }

  function formatStatus(value: string): string {
    return titleCaseIdentifier(value) || "Unknown";
  }

  function chooseAgent(current: string, list: AgentOption[]): string {
    if (current && list.some((agent) => agent.name === current)) return current;
    if (routeAgentName && list.some((agent) => agent.name === routeAgentName)) return routeAgentName;

    const stored = safeLocalStorageGet(LAST_AGENT_KEY);
    if (stored && list.some((agent) => agent.name === stored)) return stored;

    return list.find((agent) => agent.status === "running")?.name || list[0]?.name || "";
  }

  async function loadAgents(force = false) {
    if (!force && Date.now() - lastLoadedAt < 750) return;
    const req = ++statusRequestSeq;
    statusLoading = true;

    try {
      const status = await api.getStatus();
      if (req !== statusRequestSeq) return;

      const rawAgents = status?.instances?.nullclaw || {};
      const nextAgents = sortAgents(
        Object.entries(rawAgents).map(([name, info]: [string, any]) => ({
          name,
          status: typeof info?.status === "string" ? info.status : "stopped",
          version: typeof info?.version === "string" ? info.version : undefined,
          port: Number(info?.port || 0) || undefined,
        })),
      );

      agents = nextAgents;
      selectedAgentName = chooseAgent(selectedAgentName, nextAgents);
      statusError = "";
      lastLoadedAt = Date.now();
    } catch (error) {
      if (req !== statusRequestSeq) return;
      statusError = (error as Error).message || "Failed to load agents.";
    } finally {
      if (req === statusRequestSeq) statusLoading = false;
    }
  }

  function selectAgent(name: string) {
    selectedAgentName = name;
    if (selectedAgentName) safeLocalStorageSet(LAST_AGENT_KEY, selectedAgentName);
  }

  $effect(() => {
    if (!routeAgentName || agents.length === 0) return;
    if (agents.some((agent) => agent.name === routeAgentName)) {
      selectedAgentName = routeAgentName;
    }
  });

  $effect(() => {
    if (selectedAgentName) safeLocalStorageSet(LAST_AGENT_KEY, selectedAgentName);
  });

  $effect(() => {
    if (!open) return;
    void loadAgents();
  });

  $effect(() => {
    if (!browser) return;
    document.documentElement.classList.toggle("agent-chat-open", open);
    if (storageReady) safeLocalStorageSet(OPEN_KEY, open ? "1" : "0");
  });

  onMount(() => {
    selectedAgentName = safeLocalStorageGet(LAST_AGENT_KEY);
    open = safeLocalStorageGet(OPEN_KEY) === "1";
    storageReady = true;
    void loadAgents(true);
    stopStatusPolling = pollWhileVisible(() => {
      if (open) return loadAgents(true);
    }, 5000);
  });

  onDestroy(() => {
    stopStatusPolling?.();
    if (browser) document.documentElement.classList.remove("agent-chat-open");
  });
</script>

<aside class={`agent-chat-rail ${open ? "open" : ""}`} aria-label="Agent chat" aria-hidden={!open} inert={!open}>
  {#if statusError}
    <div class="agent-chat-error">{statusError}</div>
  {/if}

  <div class="agent-chat-body">
    {#if statusLoading && agents.length === 0}
      <div class="agent-chat-state">Loading agents...</div>
    {:else if agents.length === 0}
      <div class="agent-chat-state">No NullClaw agents found.</div>
    {:else if selectedAgentName}
      {#key selectedAgentName}
        <NullClawChatSurface
          component="nullclaw"
          name={selectedAgentName}
          active={open}
          mode="drawer"
          disabledReason={drawerDisabledReason}
        >
          {#snippet controlsLeft()}
            <div class="agent-control-group">
              <Select
                class="agent-select"
                value={selectedAgentName}
                disabled={statusLoading || agents.length === 0}
                aria-label="Agent"
                onchange={(event) => selectAgent((event.currentTarget as HTMLSelectElement).value)}
              >
                {#each agents as agent (agent.name)}
                  <option value={agent.name}>{formatAgentLabel(agent)}</option>
                {/each}
              </Select>
              {#if selectedAgent}
                <Badge variant={selectedStatusVariant} class="agent-status-badge">
                  {formatStatus(selectedAgent.status)}
                </Badge>
              {/if}
            </div>
          {/snippet}
        </NullClawChatSurface>
      {/key}
    {/if}
  </div>
</aside>

<style>
  :global(:root) {
    --agent-chat-rail-width: clamp(520px, 40vw, 760px);
  }

  .agent-chat-rail {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    display: flex;
    width: var(--agent-chat-rail-width);
    min-width: 0;
    flex-direction: column;
    border-left: 1px solid var(--shadcn-border);
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    box-shadow: -18px 0 38px -42px rgba(15, 23, 42, 0.48);
    pointer-events: none;
    transform: translateX(100%);
    transition: transform 220ms cubic-bezier(0.2, 0, 0, 1);
  }

  .agent-chat-rail.open {
    pointer-events: auto;
    transform: translateX(0);
  }

  .agent-control-group {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    flex: 1 1 18rem;
  }

  :global(.agent-select) {
    width: min(18rem, 100%);
    min-width: 9rem;
  }

  :global(.agent-select select) {
    height: 2rem;
    padding-left: 0.65rem;
    font-size: 0.8125rem;
  }

  .agent-chat-error {
    margin: 0.75rem 0.875rem 0;
    border: 1px solid color-mix(in srgb, var(--error) 32%, var(--shadcn-border));
    border-radius: var(--shadcn-radius);
    background: color-mix(in srgb, var(--error) 7%, var(--shadcn-card));
    color: var(--error);
    font-size: 0.8rem;
    padding: 0.55rem 0.7rem;
  }

  .agent-chat-body {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
  }

  .agent-chat-state {
    display: grid;
    min-height: 240px;
    place-items: center;
    color: var(--shadcn-muted-foreground);
    font-size: 0.9rem;
    text-align: center;
  }

  @media (max-width: 900px) {
    :global(:root) {
      --agent-chat-rail-width: min(760px, calc(100vw - 42px));
    }
  }
</style>
