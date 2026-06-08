<script lang="ts">
  import { api } from "$lib/api/client";
  import { normalizeMojibakeText } from "$lib/textEncoding";
  import ModuleFrame from "./ModuleFrame.svelte";

  let {
    port = 0,
    moduleName = "",
    moduleVersion = "",
    instanceKey = "",
    onboardingPending = false,
    starterMessage = "Wake up, my friend!",
    onboardingMarker = "",
    authToken = "",
  } = $props<{
    port?: number;
    moduleName?: string;
    moduleVersion?: string;
    instanceKey?: string;
    onboardingPending?: boolean;
    starterMessage?: string;
    onboardingMarker?: string;
    authToken?: string;
  }>();

  type HistorySession = {
    session_id: string;
    message_count: number;
  };

  type HistoryMessage = {
    role: string;
    content: string;
    created_at: string;
  };

  type ChatSeedMessage = {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    order?: number;
  };

  const DEFAULT_HISTORY_LIMIT = 200;

  function configuredWebSocketUrl(webPort: number, token: string): string {
    const template = import.meta.env.VITE_NULLCLAW_WS_BASE?.trim();
    if (!template) return "";

    const currentProtocol =
      typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const currentHost =
      typeof window !== "undefined" && window.location.host ? window.location.host : "127.0.0.1";
    const base = `${currentProtocol}//${currentHost}`;
    const value = template.replaceAll("{port}", String(webPort)).replaceAll("{path}", "ws");
    const url = new URL(value, base);
    if (url.protocol === "http:") url.protocol = "ws:";
    if (url.protocol === "https:") url.protocol = "wss:";
    if (!url.pathname.endsWith("/ws")) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/ws`;
    }
    if (token) url.searchParams.set("token", token);
    return url.toString();
  }

  function isLoopbackHost(host: string): boolean {
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
  }

  function websocketHost(host: string): string {
    if (host.includes(":") && !host.startsWith("[")) return `[${host}]`;
    return host;
  }

  const wsUrl = $derived.by(() => {
    if (port <= 0) return "";
    const token = authToken.trim();
    const configuredUrl = configuredWebSocketUrl(port, token);
    if (configuredUrl) return configuredUrl;

    const host = typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "127.0.0.1";
    if (typeof window !== "undefined" && !isLoopbackHost(host)) return "";
    if (typeof window !== "undefined" && window.location.protocol === "https:") return "";

    const url = new URL(`ws://${websocketHost(host)}:${port}/ws`);
    if (token) url.searchParams.set("token", token);
    return url.toString();
  });
  const unavailableReason = $derived.by(() => {
    if (port <= 0) return "Waiting for web channel port...";
    if (typeof window !== "undefined" && !wsUrl) {
      const host = window.location.hostname || "";
      if (window.location.protocol === "https:" || !isLoopbackHost(host)) {
        return "Secure web channel proxy is not configured.";
      }
    }
    return "Waiting for web channel port...";
  });
  const hasModule = $derived(moduleName.length > 0 && moduleVersion.length > 0);
  const mountKey = $derived(`${instanceKey}:${moduleName}:${moduleVersion}:${wsUrl}`);

  let historyReady = $state(false);
  let initialMessages = $state<ChatSeedMessage[]>([]);
  let historyRequestSeq = 0;

  function safeSessionStorageGet(key: string): string | null {
    if (typeof sessionStorage === "undefined") return null;
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeSessionStorageSet(key: string, value: string) {
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* ignore storage failures */
    }
  }

  function bootstrapAutostartKey(instance: string, marker: string): string {
    const suffix = marker.trim().length > 0 ? marker.trim() : "default";
    return `nullhub:bootstrap-autostart:${instance}:${suffix}`;
  }

  function shouldAutoStartBootstrap(
    instance: string,
    marker: string,
    pending: boolean,
    messages: ChatSeedMessage[],
  ): boolean {
    if (!pending || messages.length > 0 || !instance) return false;
    return safeSessionStorageGet(bootstrapAutostartKey(instance, marker)) !== "1";
  }

  function markBootstrapAutostarted(instance: string, marker: string) {
    if (!instance) return;
    safeSessionStorageSet(bootstrapAutostartKey(instance, marker), "1");
  }

  let autoSendMessage = $derived.by(() => {
    if (!shouldAutoStartBootstrap(instanceKey, onboardingMarker, onboardingPending, initialMessages)) {
      return "";
    }
    return starterMessage.trim();
  });

  function parseInstanceKey(value: string): { component: string; name: string } | null {
    const slashIndex = value.indexOf("/");
    if (slashIndex <= 0 || slashIndex === value.length - 1) return null;
    return {
      component: value.slice(0, slashIndex),
      name: value.slice(slashIndex + 1),
    };
  }

  function historyRoleToChatRole(role: string): ChatSeedMessage["role"] {
    switch ((role || "").toLowerCase()) {
      case "assistant":
        return "assistant";
      case "system":
      case "tool":
        return "system";
      default:
        return "user";
    }
  }

  function parseHistoryTimestamp(value: string, fallback: number): number {
    const trimmed = (value || "").trim();
    if (!trimmed) return fallback;

    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
      ? trimmed.replace(" ", "T") + "Z"
      : trimmed;
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  async function loadLatestHistory(component: string, name: string): Promise<ChatSeedMessage[]> {
    const sessions = await api.getHistory(component, name, { limit: 1, offset: 0 });
    const latestSession = Array.isArray(sessions?.sessions)
      ? (sessions.sessions[0] as HistorySession | undefined)
      : undefined;
    if (!latestSession?.session_id) return [];

    const totalMessages = Math.max(0, Number(latestSession.message_count || 0));
    if (totalMessages === 0) return [];

    const limit = Math.min(DEFAULT_HISTORY_LIMIT, totalMessages);
    const offset = Math.max(totalMessages - limit, 0);
    const transcript = await api.getHistory(component, name, {
      sessionId: latestSession.session_id,
      limit,
      offset,
    });
    const messages = Array.isArray(transcript?.messages)
      ? (transcript.messages as HistoryMessage[])
      : [];

    return messages.map((message, index) => {
      const fallbackTimestamp = Date.now() + index;
      return {
        id: `history-${latestSession.session_id}-${offset + index}`,
        role: historyRoleToChatRole(message.role),
        content: normalizeMojibakeText(message.content || ""),
        timestamp: parseHistoryTimestamp(message.created_at, fallbackTimestamp),
        order: offset + index,
      };
    });
  }

  $effect(() => {
    const parsed = parseInstanceKey(instanceKey);
    if (!hasModule || !wsUrl || !parsed) {
      initialMessages = [];
      historyReady = true;
      return;
    }

    const requestSeq = ++historyRequestSeq;
    historyReady = false;
    initialMessages = [];

    void loadLatestHistory(parsed.component, parsed.name)
      .then((messages) => {
        if (requestSeq !== historyRequestSeq) return;
        initialMessages = messages;
        historyReady = true;
      })
      .catch(() => {
        if (requestSeq !== historyRequestSeq) return;
        initialMessages = [];
        historyReady = true;
      });
  });
</script>

<div class="chat-panel">
  {#if hasModule && wsUrl}
    {#if historyReady}
      {#key mountKey}
        <ModuleFrame
          {moduleName}
          {moduleVersion}
          instanceUrl={wsUrl}
          moduleProps={{
            wsUrl,
            authToken,
            pairingCode: "123456",
            initialMessages,
            autoSendMessage,
            onAutoSend: () => markBootstrapAutostarted(instanceKey, onboardingMarker),
          }}
        />
      {/key}
    {:else}
      <div class="chat-unavailable">Loading chat history...</div>
    {/if}
  {:else if !hasModule}
    <div class="chat-unavailable">
      Chat UI module not installed. Reinstall this instance to add it.
    </div>
  {:else}
    <div class="chat-unavailable">{unavailableReason}</div>
  {/if}
</div>

<style>
  .chat-panel {
    height: min(720px, calc(100vh - 260px));
    min-height: 560px;
    border: 0;
    border-radius: 0;
    overflow: hidden;
    background: var(--shadcn-background);
    box-shadow: none;
  }
  .chat-unavailable {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
    padding: 2rem;
    text-align: center;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
  }
</style>
