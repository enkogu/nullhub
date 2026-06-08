<script lang="ts">
  import { api } from "$lib/api/client";
  import {
    describeInstanceCliError,
    isInstanceCliError,
  } from "$lib/instanceCli";
  import { normalizeMojibakeText } from "$lib/textEncoding";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import type { BadgeVariant } from "$lib/components/ui/badge";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  type HistorySession = {
    session_id: string;
    message_count: number;
    first_message_at: string;
    last_message_at: string;
  };

  type HistoryMessage = {
    role: string;
    content: string;
    created_at: string;
  };

  let { component, name, active = false } = $props<{
    component: string;
    name: string;
    active?: boolean;
  }>();

  const sessionPageSize = 50;
  const messagePageSize = 100;

  let sessions = $state<HistorySession[]>([]);
  let sessionsTotal = $state(0);
  let sessionsOffset = $state(0);
  let sessionsLoading = $state(false);
  let sessionsError = $state<string | null>(null);
  let loadedSessionsKey = $state("");

  let selectedSessionId = $state("");
  let messages = $state<HistoryMessage[]>([]);
  let messagesTotal = $state(0);
  let messagesOffset = $state(0);
  let messagesLoading = $state(false);
  let olderMessagesLoading = $state(false);
  let messagesError = $state<string | null>(null);
  let loadedMessagesKey = $state("");

  let sessionRequestSeq = 0;
  let messageRequestSeq = 0;

  const instanceKey = $derived(`${component}/${name}`);
  const selectedSession = $derived(
    sessions.find((session) => session.session_id === selectedSessionId) || null,
  );
  const visibleMessages = $derived([...messages].reverse());
  const canLoadOlder = $derived(selectedSessionId !== "" && messagesOffset > 0 && !olderMessagesLoading);
  const canShowNewerSessions = $derived(sessionsOffset > 0 && !sessionsLoading);
  const canShowOlderSessions = $derived(sessionsOffset + sessions.length < sessionsTotal && !sessionsLoading);
  const visibleSessionStart = $derived(sessions.length > 0 ? sessionsOffset + 1 : 0);
  const visibleSessionEnd = $derived(sessionsOffset + sessions.length);

  function formatTimestamp(value: string): string {
    if (!value) return "-";
    const trimmed = value.trim();
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
      ? trimmed.replace(" ", "T") + "Z"
      : trimmed;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  function messageClass(role: string): string {
    switch ((role || "").toLowerCase()) {
      case "assistant":
        return "assistant";
      case "system":
        return "system";
      case "tool":
        return "tool";
      default:
        return "user";
    }
  }

  function roleBadgeVariant(role: string): BadgeVariant {
    switch ((role || "").toLowerCase()) {
      case "assistant":
        return "success";
      case "system":
      case "tool":
        return "warning";
      default:
        return "secondary";
    }
  }

  async function loadSessions(force = false, requestedOffset = sessionsOffset) {
    if (!active || !component || !name) return;
    const contextKey = instanceKey;
    const nextKey = `${contextKey}:sessions:${requestedOffset}`;
    if (!force && loadedSessionsKey === nextKey) return;

    const req = ++sessionRequestSeq;
    sessionsLoading = true;
    sessionsError = null;

    try {
      const result = await api.getHistory(component, name, {
        limit: sessionPageSize,
        offset: requestedOffset,
      });
      if (req !== sessionRequestSeq || contextKey !== instanceKey || !active) return;

      if (isInstanceCliError(result)) {
        sessions = [];
        sessionsTotal = 0;
        sessionsOffset = requestedOffset;
        selectedSessionId = "";
        messages = [];
        messagesTotal = 0;
        messagesOffset = 0;
        loadedMessagesKey = "";
        sessionsError = describeInstanceCliError(result, "History is unavailable.");
        loadedSessionsKey = nextKey;
        return;
      }

      sessions = Array.isArray(result?.sessions) ? result.sessions : [];
      sessionsTotal = Number(result?.total || sessions.length || 0);
      sessionsOffset = Number(result?.offset ?? requestedOffset);
      loadedSessionsKey = nextKey;

      const current = sessions.find((session) => session.session_id === selectedSessionId);
      if (current) {
        selectedSessionId = current.session_id;
        return;
      }
      if (sessions.length > 0) {
        openSession(sessions[0]);
      } else {
        selectedSessionId = "";
        messages = [];
        messagesTotal = 0;
        messagesOffset = 0;
        loadedMessagesKey = "";
      }
    } catch (error) {
      if (req !== sessionRequestSeq || contextKey !== instanceKey || !active) return;
      sessions = [];
      sessionsTotal = 0;
      sessionsOffset = requestedOffset;
      sessionsError = (error as Error).message || "Failed to load history.";
    } finally {
      if (req === sessionRequestSeq && contextKey === instanceKey) {
        sessionsLoading = false;
      }
    }
  }

  function openSession(session: HistorySession) {
    if (!session?.session_id) return;
    selectedSessionId = session.session_id;
    messages = [];
    messagesTotal = Number(session.message_count || 0);
    messagesOffset = 0;
    messagesError = null;
    loadedMessagesKey = "";
  }

  async function loadInitialMessages(session: HistorySession) {
    const total = Math.max(0, Number(session?.message_count || 0));
    const offset = Math.max(total - messagePageSize, 0);
    await loadMessagesPage(session, offset, Math.min(messagePageSize, Math.max(total, 1)), "replace");
  }

  async function loadMessagesPage(
    session: HistorySession,
    offset: number,
    limit: number,
    mode: "replace" | "prepend",
  ) {
    if (!active || !session?.session_id) return;
    const contextKey = instanceKey;
    const req = ++messageRequestSeq;
    if (mode === "replace") {
      messagesLoading = true;
      messagesError = null;
    } else {
      olderMessagesLoading = true;
    }

    try {
      const result = await api.getHistory(component, name, {
        sessionId: session.session_id,
        limit,
        offset,
      });
      if (req !== messageRequestSeq || contextKey !== instanceKey || !active) return;

      if (isInstanceCliError(result)) {
        if (mode === "replace") {
          messages = [];
          messagesTotal = Number(session.message_count || 0);
          messagesOffset = 0;
        }
        messagesError = describeInstanceCliError(result, "History is unavailable.");
        loadedMessagesKey = `${instanceKey}:${session.session_id}:${session.message_count}`;
        return;
      }

      const nextMessages = Array.isArray(result?.messages)
        ? result.messages.map((message: HistoryMessage) => ({
            ...message,
            content: normalizeMojibakeText(message.content || ""),
          }))
        : [];
      const nextTotal = Number(result?.total || session.message_count || nextMessages.length || 0);
      if (mode === "prepend") {
        messages = [...nextMessages, ...messages];
      } else {
        messages = nextMessages;
      }
      messagesTotal = nextTotal;
      messagesOffset = Number(result?.offset ?? offset);
      messagesError = null;
      loadedMessagesKey = `${instanceKey}:${session.session_id}:${nextTotal}`;
    } catch (error) {
      if (req !== messageRequestSeq || contextKey !== instanceKey || !active) return;
      if (mode === "replace") {
        messages = [];
      }
      messagesError = (error as Error).message || "Failed to load session messages.";
    } finally {
      if (req === messageRequestSeq && contextKey === instanceKey) {
        messagesLoading = false;
        olderMessagesLoading = false;
      }
    }
  }

  async function loadOlderMessages() {
    if (!selectedSession || !canLoadOlder) return;
    const nextLimit = Math.min(messagePageSize, messagesOffset);
    const nextOffset = Math.max(messagesOffset - nextLimit, 0);
    await loadMessagesPage(selectedSession, nextOffset, nextLimit, "prepend");
  }

  function showOlderSessions() {
    if (!canShowOlderSessions) return;
    void loadSessions(true, sessionsOffset + sessionPageSize);
  }

  function showNewerSessions() {
    if (!canShowNewerSessions) return;
    void loadSessions(true, Math.max(sessionsOffset - sessionPageSize, 0));
  }

  function refreshHistory() {
    loadedSessionsKey = "";
    loadedMessagesKey = "";
    void loadSessions(true, sessionsOffset);
  }

  $effect(() => {
    if (!active || !component || !name) return;
    if (loadedSessionsKey === `${instanceKey}:sessions`) return;
    sessions = [];
    sessionsTotal = 0;
    sessionsOffset = 0;
    sessionsError = null;
    selectedSessionId = "";
    messages = [];
    messagesTotal = 0;
    messagesOffset = 0;
    messagesError = null;
    loadedMessagesKey = "";
    void loadSessions(true, 0);
  });

  $effect(() => {
    if (!active || !selectedSession) return;
    const key = `${instanceKey}:${selectedSession.session_id}:${selectedSession.message_count}`;
    if (loadedMessagesKey === key) return;
    void loadInitialMessages(selectedSession);
  });
</script>

<div class="history-panel">
  <div class="panel-toolbar">
    <div>
      <h2>Conversation History</h2>
      <p>Stored sessions and message transcripts from this instance.</p>
    </div>
    <Button
      variant="outline"
      size="icon-sm"
      onclick={refreshHistory}
      disabled={sessionsLoading || messagesLoading}
      title="Refresh history"
      aria-label="Refresh history"
    >
      <RefreshCwIcon />
    </Button>
  </div>

  {#if sessionsError}
    <div class="panel-state warning">{sessionsError}</div>
  {:else if sessionsLoading && sessions.length === 0}
    <div class="panel-state">Loading sessions...</div>
  {:else if sessions.length === 0}
    <div class="panel-state">No conversation history yet.</div>
  {:else}
    <div class="history-grid">
      <aside class="session-list">
        <div class="session-list-header">
          <span>Sessions</span>
          <span>
            {#if sessions.length > 0}
              {visibleSessionStart}-{visibleSessionEnd} / {sessionsTotal}
            {:else}
              {sessionsTotal}
            {/if}
          </span>
        </div>
        <div class="session-page-controls">
          <Button variant="outline" size="sm" onclick={showNewerSessions} disabled={!canShowNewerSessions}>
            Newer
          </Button>
          <Button variant="outline" size="sm" onclick={showOlderSessions} disabled={!canShowOlderSessions}>
            Older
          </Button>
        </div>
        {#each sessions as session}
          <button
            class="session-item"
            class:active={session.session_id === selectedSessionId}
            onclick={() => openSession(session)}
          >
            <div class="session-id">{session.session_id}</div>
            <div class="session-meta">
              <span>{session.message_count} msg</span>
              <span>{formatTimestamp(session.last_message_at)}</span>
            </div>
          </button>
        {/each}
      </aside>

      <section class="message-pane">
        {#if !selectedSession}
          <div class="panel-state">Select a session to view messages.</div>
        {:else}
          <div class="message-header">
            <div>
              <div class="message-title">{selectedSession.session_id}</div>
              <div class="message-subtitle">
                {#if messages.length > 0}
                  Showing {messagesOffset + 1}-{messagesOffset + messages.length} of {messagesTotal}
                {:else}
                  {messagesTotal} message(s)
                {/if}
              </div>
            </div>
            {#if canLoadOlder}
              <Button variant="outline" size="sm" onclick={loadOlderMessages} disabled={olderMessagesLoading}>
                {olderMessagesLoading ? "Loading..." : "Load older"}
              </Button>
            {/if}
          </div>

          {#if messagesError}
            <div class="panel-state warning">{messagesError}</div>
          {:else if messagesLoading}
            <div class="panel-state">Loading messages...</div>
          {:else if messages.length === 0}
            <div class="panel-state">No messages found for this session.</div>
          {:else}
            <div class="message-list">
              {#each visibleMessages as message}
                <article class={`message-card ${messageClass(message.role)}`}>
                  <header>
                    <Badge variant={roleBadgeVariant(message.role)}>{message.role}</Badge>
                    <span class="message-time">{formatTimestamp(message.created_at)}</span>
                  </header>
                  <pre>{message.content}</pre>
                </article>
              {/each}
            </div>
          {/if}
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .history-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .panel-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }
  .panel-toolbar h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--shadcn-foreground);
  }
  .panel-toolbar p {
    margin: 0.25rem 0 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }
  .panel-state {
    padding: 1.5rem;
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-muted);
    color: var(--shadcn-muted-foreground);
    border-radius: var(--shadcn-radius);
    text-align: center;
  }
  .panel-state.warning {
    border-color: var(--shadcn-border);
    color: var(--shadcn-destructive);
    background: color-mix(in srgb, var(--shadcn-destructive) 6%, transparent);
  }
  .history-grid {
    display: grid;
    grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
    gap: 1rem;
  }
  .session-list,
  .message-pane {
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
  }
  .session-list {
    display: flex;
    flex-direction: column;
    max-height: 720px;
    overflow: auto;
  }
  .session-list-header {
    display: flex;
    justify-content: space-between;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--shadcn-border);
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .session-page-controls {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--shadcn-border);
  }
  .session-item {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.9rem 1rem;
    text-align: left;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--shadcn-border);
    color: var(--shadcn-foreground);
    cursor: pointer;
  }
  .session-item:hover,
  .session-item.active {
    background: var(--shadcn-accent);
  }
  .session-id {
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.78rem;
    word-break: break-all;
  }
  .session-meta {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
  }
  .message-pane {
    display: flex;
    flex-direction: column;
    min-height: 480px;
  }
  .message-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
    padding: 1rem 1.2rem;
    border-bottom: 1px solid var(--shadcn-border);
  }
  .message-title {
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.85rem;
    word-break: break-all;
    color: var(--shadcn-foreground);
  }
  .message-subtitle {
    margin-top: 0.25rem;
    color: var(--shadcn-muted-foreground);
    font-size: 0.78rem;
  }
  .message-list {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    padding: 1.2rem;
  }
  .message-card {
    padding: 0.95rem 1rem;
    border-radius: var(--shadcn-radius);
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-card);
  }
  .message-card.assistant {
    background: var(--shadcn-muted);
  }
  .message-card.system,
  .message-card.tool {
    background: var(--shadcn-muted);
  }
  .message-card header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.65rem;
    font-size: 0.76rem;
    color: var(--shadcn-muted-foreground);
  }
  .message-card pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--shadcn-foreground);
  }

  @media (max-width: 900px) {
    .history-grid {
      grid-template-columns: 1fr;
    }
    .panel-toolbar,
    .message-header {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
