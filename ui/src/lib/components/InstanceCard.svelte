<script lang="ts">
  import StatusBadge from "./StatusBadge.svelte";
  import { api } from "$lib/api/client";
  import { instanceRoute } from "$lib/nullstack/path";

  let {
    component = "",
    name = "",
    version = "",
    status = "stopped",
    autoStart = false,
    port = 0,
    onAction = () => {},
  } = $props();
  let loading = $state(false);
  let localStatus = $state("stopped");
  let displayVersion = $derived(
    !version ? "-" : version.startsWith("v") || version.startsWith("dev-") ? version : `v${version}`,
  );
  let portLabel = $derived(component === "nullclaw" ? "Gateway" : "API");
  let detailHref = $derived(instanceRoute(component, name));

  // Sync localStatus when prop changes (from poll)
  $effect(() => {
    localStatus = status || "stopped";
  });

  async function start(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    loading = true;
    localStatus = "starting";
    try {
      await api.startInstance(component, name);
      onAction();
    } catch {
      localStatus = "stopped";
    } finally {
      loading = false;
    }
  }

  async function stop(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    loading = true;
    localStatus = "stopping";
    try {
      await api.stopInstance(component, name);
      onAction();
    } catch {
      localStatus = "running";
    } finally {
      loading = false;
    }
  }
</script>

<div class="card">
  <a href={detailHref} class="card-main">
    <div class="card-header">
      <span class="card-name">{name}</span>
      <StatusBadge status={localStatus} />
    </div>
    <div class="card-meta">
      <span class="component-tag">{component}</span>
      <span class="version">{displayVersion}</span>
    </div>
    {#if localStatus === "running" && port > 0}
      <div class="gateway-addr">
        <span class="gateway-label">{portLabel}:</span>
        <code>127.0.0.1:{port}</code>
      </div>
    {/if}
  </a>
  <div class="card-actions">
    {#if localStatus === "running" || localStatus === "stopping"}
      <button type="button" onclick={stop} disabled={loading}>
        {loading ? "Stopping..." : "Stop"}
      </button>
    {:else}
      <button type="button" onclick={start} disabled={loading}>
        {loading ? "Starting..." : "Start"}
      </button>
    {/if}
  </div>
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    min-height: 12rem;
    padding: 1rem;
    background: var(--shadcn-card);
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    color: var(--shadcn-card-foreground);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
    transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .card:hover {
    background: var(--shadcn-card);
    border-color: color-mix(in srgb, var(--shadcn-foreground) 18%, var(--shadcn-border));
    box-shadow: 0 4px 10px rgb(0 0 0 / 0.05);
  }

  .card-main {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    color: inherit;
  }

  .card-main:hover {
    text-decoration: none;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .card-name {
    min-width: 0;
    overflow: hidden;
    color: var(--shadcn-foreground);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1.3;
    text-overflow: ellipsis;
    text-shadow: none;
    text-transform: none;
    white-space: nowrap;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    font-size: 0.8125rem;
    color: var(--shadcn-muted-foreground);
  }

  .component-tag {
    display: inline-flex;
    align-items: center;
    min-height: 1.5rem;
    padding: 0.125rem 0.5rem;
    background: var(--shadcn-muted);
    border: 1px solid transparent;
    border-radius: calc(var(--shadcn-radius) - 2px);
    color: var(--shadcn-muted-foreground);
    font-family: var(--shadcn-font-sans);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }

  .version {
    color: var(--shadcn-muted-foreground);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    opacity: 1;
  }

  .card-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: auto;
  }

  .card-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.25rem;
    padding: 0.5rem 0.875rem;
    border: 1px solid var(--shadcn-input);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    font-size: 0.8125rem;
    font-weight: 500;
    letter-spacing: 0;
    line-height: 1;
    text-shadow: none;
    text-transform: none;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
  }

  .card-actions button:hover {
    background: var(--shadcn-accent);
    border-color: var(--shadcn-border);
    box-shadow: none;
    text-shadow: none;
  }

  .card-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .gateway-addr {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    font-size: 0.8125rem;
    padding: 0.625rem 0.75rem;
    background: var(--shadcn-muted);
    border: 1px solid transparent;
    border-radius: calc(var(--shadcn-radius) - 2px);
  }

  .gateway-label {
    flex: 0 0 auto;
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    text-transform: none;
  }

  .gateway-addr code {
    min-width: 0;
    overflow: hidden;
    color: var(--shadcn-foreground);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    text-overflow: ellipsis;
    text-shadow: none;
    white-space: nowrap;
  }
</style>
