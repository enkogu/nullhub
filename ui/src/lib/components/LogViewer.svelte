<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";
  import type { LogSource } from "$lib/api/client";
  import { pollWhileVisible } from "$lib/poll";
  import { Button } from "$lib/components/ui/button";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  let { component = "", name = "" } = $props();
  let lines = $state<string[]>([]);
  let container: HTMLElement;
  let autoScroll = $state(true);
  let source = $state<LogSource>("instance");

  const sourceLabels: Record<LogSource, string> = {
    instance: "Instance",
    nullhub: "NullHub",
  };
  const logSources: LogSource[] = ["instance", "nullhub"];

  async function fetchLogs() {
    const requestedSource = source;
    try {
      const data = await api.getLogs(component, name, 200, requestedSource);
      if (requestedSource !== source) return;
      lines = data.lines || [];
      scrollToBottom();
    } catch {
      if (lines.length === 0) lines = ["Failed to load logs"];
    }
  }

  onMount(() => {
    void fetchLogs();
    return pollWhileVisible(fetchLogs, 3000);
  });

  $effect(() => {
    component;
    name;
    source;
    void fetchLogs();
  });

  function scrollToBottom() {
    if (autoScroll && container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }

  async function clearLogs() {
    await api.clearLogs(component, name, source);
    lines = [];
  }
</script>

<div class="log-viewer">
  <div class="log-header">
    <div class="log-title-group">
      <span class="log-title">Logs</span>
      <div class="source-switch" role="tablist" aria-label="Log source">
        {#each logSources as option}
          <button
            type="button"
            class="source-btn"
            class:active={source === option}
            onclick={() => (source = option)}
          >
            {sourceLabels[option]}
          </button>
        {/each}
      </div>
    </div>
    <div class="log-actions">
      <Button variant="ghost" size="icon-sm" onclick={fetchLogs} title="Refresh logs" aria-label="Refresh logs">
        <RefreshCwIcon />
      </Button>
      <Button variant="ghost" size="icon-sm" onclick={clearLogs} title="Clear logs" aria-label="Clear logs">
        <Trash2Icon />
      </Button>
      <label class="auto-scroll">
        <input type="checkbox" bind:checked={autoScroll} />
        Auto-scroll
      </label>
    </div>
  </div>
  <div class="log-content" bind:this={container}>
    {#each lines as line}
      <div class="log-line">{line}</div>
    {/each}
    {#if lines.length === 0}
      <div class="log-empty">No {sourceLabels[source]} logs available</div>
    {/if}
  </div>
</div>

<style>
  .log-viewer {
    display: flex;
    flex-direction: column;
    height: 400px;
    background: var(--shadcn-card);
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
  }
  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--shadcn-border);
  }
  .log-title-group {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
  }
  .log-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--shadcn-foreground);
  }
  .source-switch {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1875rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
  }
  .source-btn {
    padding: 0.3rem 0.65rem;
    border: 1px solid transparent;
    border-radius: calc(var(--shadcn-radius) - 2px);
    background: transparent;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .source-btn:hover {
    background: var(--shadcn-accent);
    color: var(--shadcn-foreground);
  }
  .source-btn.active {
    color: var(--shadcn-foreground);
    border-color: var(--shadcn-border);
    background: var(--shadcn-background);
    font-weight: 500;
  }
  .log-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--shadcn-foreground);
  }
  .log-line {
    white-space: pre-wrap;
    word-break: break-all;
    margin-bottom: 0.125rem;
  }
  .log-line:hover {
    background: var(--shadcn-muted);
  }
  .log-empty {
    color: var(--shadcn-muted-foreground);
    text-align: center;
    padding: 3rem;
  }
  .log-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .auto-scroll {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--shadcn-muted-foreground);
    cursor: pointer;
  }
  .auto-scroll input[type="checkbox"] {
    appearance: none;
    width: 14px;
    height: 14px;
    border: 1px solid var(--shadcn-border);
    background: var(--shadcn-background);
    border-radius: 4px;
    position: relative;
    cursor: pointer;
  }
  .auto-scroll input[type="checkbox"]:checked {
    background: var(--shadcn-foreground);
    border-color: var(--shadcn-foreground);
  }
  .auto-scroll input[type="checkbox"]:checked::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 4px;
    width: 4px;
    height: 7px;
    border: solid var(--shadcn-background);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }
  @media (max-width: 760px) {
    .log-header {
      flex-direction: column;
      align-items: stretch;
    }
    .log-title-group {
      justify-content: space-between;
      flex-wrap: wrap;
    }
    .log-actions {
      justify-content: space-between;
    }
  }
</style>
