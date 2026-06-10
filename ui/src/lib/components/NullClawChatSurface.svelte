<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import { api, type AgentInvokeResponse } from "$lib/api/client";
  import { normalizeMojibakeText } from "$lib/textEncoding";
  import { Button } from "$lib/components/ui/button";
  import { Badge, type BadgeVariant } from "$lib/components/ui/badge";
  import { Select } from "$lib/components/ui/select";
  import NullClawChatComposer from "$lib/components/NullClawChatComposer.svelte";
  import PlusIcon from "@lucide/svelte/icons/plus";

  type HistorySession = {
    session_id: string;
    message_count: number;
    first_message_at?: string;
    last_message_at?: string;
  };

  type HistoryMessage = {
    role: string;
    content: string;
    created_at: string;
  };

  type ChatMessage = {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
    pending?: boolean;
    error?: boolean;
  };

  let {
    component = "nullclaw",
    name = "",
    active = true,
    mode = "page",
    disabledReason = "",
    autoStartMessage = "",
    autoStartMarker = "",
    onSessionChange = () => {},
    controlsLeft,
  } = $props<{
    component?: string;
    name: string;
    active?: boolean;
    mode?: "page" | "drawer";
    disabledReason?: string;
    autoStartMessage?: string;
    autoStartMarker?: string;
    onSessionChange?: (sessionId: string) => void;
    controlsLeft?: Snippet;
  }>();

  const sessionPageSize = 100;
  const messagePageSize = 120;

  let sessions = $state<HistorySession[]>([]);
  let sessionsTotal = $state(0);
  let sessionsLoading = $state(false);
  let messagesLoading = $state(false);
  let sending = $state(false);
  let selectedSessionId = $state("");
  let messages = $state<ChatMessage[]>([]);
  let surfaceError = $state("");
  let initializedKey = $state("");
  let loadedMessagesKey = $state("");
  let loadingMessagesKey = "";
  let focusKey = $state("");
  let messagesPane: HTMLDivElement | null = $state(null);
  let requestSeq = 0;
  let messageSeq = 0;
  let abortController: AbortController | null = null;
  let cancelRequested = false;
  let autoStartSentKey = "";

  const instanceKey = $derived(component && name ? `${component}/${name}` : "");
  const disabled = $derived(Boolean(disabledReason || !instanceKey));
  const selectedSession = $derived(
    sessions.find((session) => session.session_id === selectedSessionId) || null,
  );
  const hasSelectedSessionOption = $derived(
    selectedSessionId === "" || sessions.some((session) => session.session_id === selectedSessionId),
  );
  const selectedSessionLabel = $derived(
    selectedSession ? sessionOptionLabel(selectedSession) : selectedSessionId ? friendlySessionName(selectedSessionId) : "New chat",
  );

  function safeLocalStorageGet(key: string): string {
    if (typeof localStorage === "undefined") return "";
    try {
      return localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function safeLocalStorageSet(key: string, value: string) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore storage failures */
    }
  }

  function lastSessionKey(key: string): string {
    return `nullhub:agent-chat:last-session:${key}`;
  }

  function bootstrapAutostartKey(key: string, marker: string): string {
    const suffix = marker.trim().length > 0 ? marker.trim() : "default";
    return `nullhub:bootstrap-autostart:${key}:${suffix}`;
  }

  function persistSession(sessionId: string) {
    if (!instanceKey || !sessionId) return;
    safeLocalStorageSet(lastSessionKey(instanceKey), sessionId);
    onSessionChange(sessionId);
  }

  function formatTimestamp(value?: string): string {
    if (!value) return "";
    const trimmed = value.trim();
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
      ? `${trimmed.replace(" ", "T")}Z`
      : trimmed;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function shortSessionId(sessionId: string): string {
    if (sessionId.length <= 18) return sessionId;
    return `${sessionId.slice(0, 10)}...${sessionId.slice(-5)}`;
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

  function friendlySessionName(sessionId: string): string {
    const parts = sessionId.split(/[:/_-]+/).filter(Boolean);
    if (parts[0]?.toLowerCase() === "agent" && parts[1]?.toLowerCase() === "main") {
      const tail = parts.slice(2).join(" ");
      const tailLower = tail.toLowerCase();
      if (!tail || tail.toLowerCase() === name.toLowerCase()) return "Main";
      if (tailLower === "web direct" || tailLower === "web direct default") return "Web chat";
      if (tailLower.startsWith("telegram direct")) {
        const telegramId = tail.split(" ").slice(2).join(" ");
        return telegramId ? `Telegram · ${telegramId}` : "Telegram chat";
      }
      return `Main · ${titleCaseIdentifier(tail)}`;
    }

    if (/^[a-f0-9-]{18,}$/i.test(sessionId)) return `Chat ${sessionId.slice(0, 6)}`;
    return titleCaseIdentifier(sessionId.replace(/:/g, " ")) || shortSessionId(sessionId);
  }

  function messageCountLabel(count: number): string {
    if (!count) return "";
    return `${count} msg`;
  }

  function sessionOptionLabel(session: HistorySession): string {
    const label = friendlySessionName(session.session_id);
    const timestamp = formatTimestamp(session.last_message_at || session.first_message_at);
    const count = messageCountLabel(Number(session.message_count || 0));
    return [label, timestamp, count].filter(Boolean).join(" · ");
  }

  function roleToChatRole(role: string): ChatMessage["role"] {
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

  function roleBadgeVariant(role: ChatMessage["role"]): BadgeVariant {
    if (role === "assistant") return "success";
    if (role === "system") return "warning";
    return "secondary";
  }

  function responseText(result: AgentInvokeResponse): string {
    if (typeof result.response === "string") return normalizeMojibakeText(result.response);
    const candidate = result.message || result.content || result.text;
    if (typeof candidate === "string") return normalizeMojibakeText(candidate);
    return normalizeMojibakeText(JSON.stringify(result, null, 2));
  }

  function responseSession(result: AgentInvokeResponse): string {
    if (typeof result.session === "string" && result.session.trim()) return result.session.trim();
    if (typeof result.session_key === "string" && result.session_key.trim()) return result.session_key.trim();
    return "";
  }

  function historyMessagesToChat(sessionId: string, source: HistoryMessage[]): ChatMessage[] {
    return [...source].reverse().map((message, index) => ({
      id: `history-${sessionId}-${index}`,
      role: roleToChatRole(message.role),
      content: normalizeMojibakeText(message.content || ""),
      createdAt: message.created_at || "",
    }));
  }

  async function loadSessions(force = false) {
    if (!active || !instanceKey || disabled) return;
    const key = instanceKey;
    const req = ++requestSeq;
    sessionsLoading = true;
    surfaceError = "";

    try {
      const result = await api.getHistory(component, name, {
        limit: sessionPageSize,
        offset: 0,
      });
      if (req !== requestSeq || key !== instanceKey || !active) return;

      const nextSessions = Array.isArray(result?.sessions) ? result.sessions as HistorySession[] : [];
      sessions = nextSessions;
      sessionsTotal = Number(result?.total || nextSessions.length || 0);

      const stored = safeLocalStorageGet(lastSessionKey(key));
      const current = selectedSessionId && nextSessions.some((session) => session.session_id === selectedSessionId)
        ? selectedSessionId
        : "";
      const storedSession = stored && nextSessions.some((session) => session.session_id === stored) ? stored : "";
      const preferred = current || storedSession || nextSessions[0]?.session_id || "";
      selectedSessionId = preferred;
      if (!preferred) {
        messages = [];
        loadedMessagesKey = "";
      }
    } catch (error) {
      if (req !== requestSeq || key !== instanceKey || !active) return;
      sessions = [];
      sessionsTotal = 0;
      surfaceError = (error as Error).message || "Failed to load chat sessions.";
    } finally {
      if (req === requestSeq && key === instanceKey) {
        sessionsLoading = false;
      }
    }
  }

  async function loadMessages(sessionId: string) {
    if (!active || !instanceKey || !sessionId || disabled) return;
    const key = `${instanceKey}:${sessionId}`;
    if (loadedMessagesKey === key && messages.length > 0) return;
    if (loadingMessagesKey === key) return;

    const req = ++messageSeq;
    loadingMessagesKey = key;
    messagesLoading = true;
    surfaceError = "";

    try {
      const session = sessions.find((item) => item.session_id === sessionId);
      const total = Math.max(0, Number(session?.message_count || 0));
      const limit = total > 0 ? Math.min(messagePageSize, total) : messagePageSize;
      const offset = total > 0 ? Math.max(total - limit, 0) : 0;
      const result = await api.getHistory(component, name, {
        sessionId,
        limit,
        offset,
      });
      if (req !== messageSeq || key !== `${instanceKey}:${sessionId}` || !active) return;

      const nextMessages = Array.isArray(result?.messages)
        ? historyMessagesToChat(sessionId, result.messages as HistoryMessage[])
        : [];
      messages = nextMessages;
      loadedMessagesKey = key;
      persistSession(sessionId);
    } catch (error) {
      if (req !== messageSeq || key !== `${instanceKey}:${sessionId}` || !active) return;
      messages = [];
      surfaceError = (error as Error).message || "Failed to load session messages.";
    } finally {
      if (loadingMessagesKey === key) loadingMessagesKey = "";
      if (req === messageSeq && key === `${instanceKey}:${sessionId}`) {
        messagesLoading = false;
      }
    }
  }

  function selectSession(value: string) {
    selectedSessionId = value;
    surfaceError = "";
    if (!value) {
      messages = [];
      loadedMessagesKey = "";
      focusKey = `new:${Date.now()}`;
      return;
    }
    persistSession(value);
    void loadMessages(value);
  }

  function startNewSession() {
    selectSession("");
  }

  async function sendMessage(text: string) {
    if (disabled || sending || !instanceKey) return;

    const createdAt = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: text,
      createdAt,
    };
    const assistantId = `local-assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt,
      pending: true,
    };

    messages = [...messages, userMessage, assistantMessage];
    sending = true;
    surfaceError = "";
    cancelRequested = false;
    abortController = new AbortController();

    try {
      const result = await api.invokeAgent(
        component,
        name,
        {
          message: text,
          session_key: selectedSessionId || undefined,
        },
        { signal: abortController.signal },
      );
      const nextSessionId = responseSession(result) || selectedSessionId;
      const nextText = responseText(result);
      messages = messages.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: nextText,
              pending: false,
              createdAt: new Date().toISOString(),
            }
          : message,
      );
      if (nextSessionId) {
        selectedSessionId = nextSessionId;
        persistSession(nextSessionId);
        loadedMessagesKey = `${instanceKey}:${nextSessionId}`;
      }
      void loadSessions(true);
    } catch (error) {
      const message = cancelRequested
        ? "Stopped."
        : ((error as Error).message || "Failed to send message.");
      messages = messages.map((item) =>
        item.id === assistantId
          ? {
              ...item,
              content: message,
              pending: false,
              error: true,
              createdAt: new Date().toISOString(),
            }
          : item,
      );
      if (!cancelRequested) surfaceError = message;
    } finally {
      sending = false;
      abortController = null;
      cancelRequested = false;
      focusKey = `sent:${Date.now()}`;
    }
  }

  function cancelSend() {
    cancelRequested = true;
    abortController?.abort();
  }

  $effect(() => {
    if (!active || !instanceKey) return;
    if (initializedKey === instanceKey) return;
    initializedKey = instanceKey;
    requestSeq += 1;
    messageSeq += 1;
    sessions = [];
    sessionsTotal = 0;
    messages = [];
    selectedSessionId = safeLocalStorageGet(lastSessionKey(instanceKey));
    loadedMessagesKey = "";
    loadingMessagesKey = "";
    surfaceError = "";
    void loadSessions(true);
  });

  $effect(() => {
    if (!active || !selectedSessionId || disabled || sessionsLoading) return;
    if (sessions.length > 0 && !sessions.some((session) => session.session_id === selectedSessionId)) return;
    void loadMessages(selectedSessionId);
  });

  $effect(() => {
    messages.length;
    sending;
    void tick().then(() => {
      if (!messagesPane) return;
      messagesPane.scrollTop = messagesPane.scrollHeight;
    });
  });

  $effect(() => {
    if (!active || disabled || sending || sessionsLoading || messagesLoading) return;
    if (!autoStartMessage.trim() || selectedSessionId || messages.length > 0) return;
    const markerKey = `${instanceKey}:${autoStartMarker || "default"}`;
    if (!instanceKey || autoStartSentKey === markerKey) return;
    const storageKey = bootstrapAutostartKey(instanceKey, autoStartMarker);
    if (safeLocalStorageGet(storageKey) === "1") return;
    autoStartSentKey = markerKey;
    safeLocalStorageSet(storageKey, "1");
    void sendMessage(autoStartMessage.trim());
  });

</script>

<section class={`nullclaw-chat-surface ${mode}`}>
  <div class={`chat-session-bar ${mode === "drawer" ? "drawer" : ""}`}>
    {#if controlsLeft}
      <div class="chat-agent-controls">
        {@render controlsLeft()}
      </div>
    {/if}

    <Select
      class="session-select"
      value={selectedSessionId}
      disabled={disabled || sessionsLoading || sending}
      aria-label="Conversation session"
      onchange={(event) => selectSession((event.currentTarget as HTMLSelectElement).value)}
    >
      <option value="">New chat</option>
      {#if selectedSessionId && !hasSelectedSessionOption}
        <option value={selectedSessionId}>{selectedSessionLabel}</option>
      {/if}
      {#each sessions as session (session.session_id)}
        <option value={session.session_id}>{sessionOptionLabel(session)}</option>
      {/each}
    </Select>

    <div class="session-actions">
      <Button
        variant="ghost"
        size="icon-sm"
        class="new-chat-button"
        onclick={startNewSession}
        disabled={disabled || sending}
        aria-label="New chat"
        title="New chat"
      >
        <PlusIcon />
      </Button>
    </div>
  </div>

  {#if disabledReason}
    <div class="chat-state">{disabledReason}</div>
  {:else}
    {#if surfaceError}
      <div class="chat-error">{surfaceError}</div>
    {/if}

    <div class="messages-pane" bind:this={messagesPane}>
      {#if sessionsLoading && sessions.length === 0}
        <div class="chat-state">Loading sessions...</div>
      {:else if messagesLoading && messages.length === 0}
        <div class="chat-state">Loading messages...</div>
      {:else if messages.length === 0}
        <div class="empty-chat">
          <div class="empty-title">{selectedSessionId ? "No messages found." : "New chat"}</div>
          <div class="empty-subtitle">{name || "NullClaw"}</div>
        </div>
      {:else}
        <div class="message-list">
          {#each messages as message (message.id)}
            <article class={`message ${message.role}`} class:pending={message.pending} class:error={message.error}>
              <div class="message-card">
                <header>
                  <Badge variant={message.error ? "destructive" : roleBadgeVariant(message.role)}>
                    {message.error ? "error" : message.role}
                  </Badge>
                  {#if message.createdAt}
                    <span>{formatTimestamp(message.createdAt)}</span>
                  {/if}
                </header>
                {#if message.pending}
                  <div class="typing-dots" aria-label="Waiting for response">
                    <span></span><span></span><span></span>
                  </div>
                {:else}
                  <pre>{message.content}</pre>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </div>

    <div class="composer-wrap">
      <NullClawChatComposer
        disabled={disabled}
        running={sending}
        {focusKey}
        onSubmit={sendMessage}
        onCancel={cancelSend}
      />
    </div>
  {/if}
</section>

<style>
  .nullclaw-chat-surface {
    display: flex;
    min-height: 0;
    height: 100%;
    flex-direction: column;
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
  }

  .nullclaw-chat-surface.page {
    height: min(760px, calc(100dvh - 250px));
    min-height: 560px;
  }

  .chat-session-bar {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    min-height: 38px;
    padding: 0 0 0.65rem;
    border-bottom: 1px solid var(--shadcn-border);
  }

  .chat-session-bar.drawer {
    min-height: 60px;
    padding: 0 0.75rem;
    gap: 0.5rem;
    flex: 0 0 auto;
  }

  .chat-agent-controls {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    flex: 1 1 auto;
  }

  :global(.session-select) {
    width: min(18rem, 42%);
    min-width: 0;
  }

  .chat-session-bar.drawer :global(.session-select) {
    flex: 0 1 17rem;
    width: auto;
  }

  :global(.session-select select) {
    height: 2rem;
    padding-left: 0.65rem;
    font-size: 0.8125rem;
  }

  .session-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    margin-left: auto;
  }

  .new-chat-button :global(svg) {
    stroke-width: 1.85;
  }

  .messages-pane {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1rem 0.25rem 1rem 0;
    scrollbar-width: thin;
  }

  .message-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: min(100%, 760px);
    margin: 0 auto;
    padding: 0.5rem 0.5rem 0;
  }

  .message {
    display: flex;
  }

  .message.user {
    justify-content: flex-end;
  }

  .message.assistant,
  .message.system {
    justify-content: flex-start;
  }

  .message-card {
    max-width: min(640px, 82%);
    border-radius: 16px;
    padding: 0.72rem 0.84rem;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .message.user .message-card {
    background: var(--shadcn-muted);
    color: var(--shadcn-foreground);
  }

  .message.assistant .message-card,
  .message.system .message-card {
    background: transparent;
    color: var(--shadcn-foreground);
  }

  .message.error .message-card {
    border: 1px solid color-mix(in srgb, var(--error) 35%, var(--shadcn-border));
    background: color-mix(in srgb, var(--error) 7%, var(--shadcn-card));
  }

  .message-card header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.45rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.72rem;
  }

  .message.user .message-card header {
    justify-content: flex-end;
  }

  .message-card pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font: inherit;
  }

  .typing-dots {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    min-height: 1.5rem;
  }

  .typing-dots span {
    width: 0.34rem;
    height: 0.34rem;
    border-radius: 999px;
    background: var(--shadcn-muted-foreground);
    animation: typing-dot 1s infinite ease-in-out;
  }

  .typing-dots span:nth-child(2) {
    animation-delay: 120ms;
  }

  .typing-dots span:nth-child(3) {
    animation-delay: 240ms;
  }

  .composer-wrap {
    width: min(100%, 760px);
    margin: 0 auto;
    padding: 0.25rem 0.5rem 0;
  }

  .chat-state,
  .chat-error,
  .empty-chat {
    display: grid;
    place-items: center;
    min-height: 220px;
    padding: 2rem;
    color: var(--shadcn-muted-foreground);
    text-align: center;
    font-size: 0.875rem;
  }

  .chat-error {
    min-height: auto;
    margin: 0.75rem 0 0;
    padding: 0.65rem 0.8rem;
    border: 1px solid color-mix(in srgb, var(--error) 28%, var(--shadcn-border));
    border-radius: var(--shadcn-radius);
    background: color-mix(in srgb, var(--error) 7%, var(--shadcn-card));
    color: var(--error);
  }

  .empty-chat {
    align-content: center;
    gap: 0.25rem;
  }

  .empty-title {
    color: var(--shadcn-foreground);
    font-size: 0.95rem;
    font-weight: 650;
  }

  .empty-subtitle {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8rem;
  }

  @keyframes typing-dot {
    0%,
    80%,
    100% {
      opacity: 0.35;
      transform: translateY(0);
    }
    40% {
      opacity: 1;
      transform: translateY(-2px);
    }
  }

  @media (max-width: 700px) {
    .chat-session-bar {
      gap: 0.4rem;
    }

    .chat-session-bar.drawer {
      flex-wrap: wrap;
      min-height: auto;
    }

    .chat-agent-controls,
    .chat-session-bar.drawer :global(.session-select) {
      flex: 1 1 100%;
      width: 100%;
    }

    :global(.session-select) {
      flex: 1;
      width: 100%;
    }

    .message-card {
      max-width: 92%;
    }
  }
</style>
