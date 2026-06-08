<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";

  let status = $state<any>(null);
  let error = $state<string | null>(null);
  let interval: ReturnType<typeof setInterval>;

  const agents = $derived(
    Object.entries((status?.instances?.nullclaw || {}) as Record<string, any>).map(([name, info]) => ({
      name,
      info,
      href: `/instances/nullclaw/${encodeURIComponent(name)}`,
    })),
  );

  async function refresh() {
    try {
      status = await api.getStatus();
      error = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function statusLabel(info: any): string {
    return typeof info?.status === "string" && info.status.trim() ? info.status : "unknown";
  }

  function profileLabel(info: any): string {
    const value = info?.profile || info?.metadata?.profile || info?.config?.profile;
    return typeof value === "string" && value.trim() ? value : "-";
  }

  function rolesLabel(info: any): string {
    const value = info?.roles || info?.metadata?.roles || info?.config?.roles;
    if (Array.isArray(value) && value.length > 0) return value.map(String).join(", ");
    if (typeof value === "string" && value.trim()) return value;
    return "-";
  }

  onMount(() => {
    void refresh();
    interval = setInterval(refresh, 5000);
  });

  onDestroy(() => clearInterval(interval));
</script>

<div class="page">
  <div class="header">
    <h1>Agents</h1>
    <button class="btn" onclick={refresh}>Refresh</button>
  </div>

  {#if error}
    <div class="error-banner">ERR: {error}</div>
  {/if}

  <div class="table-card">
    <div class="table-head">
      <span>Agent</span>
      <span>Status</span>
      <span>Profile</span>
      <span>Roles</span>
      <span></span>
    </div>
    {#if agents.length === 0}
      <div class="empty-row">No agents</div>
    {:else}
      {#each agents as agent (agent.name)}
        <div class="table-row">
          <div>
            <strong>{agent.name}</strong>
            <span>{agent.info?.version || "-"}</span>
          </div>
          <span class:running={statusLabel(agent.info) === "running"}>{statusLabel(agent.info)}</span>
          <span>{profileLabel(agent.info)}</span>
          <span>{rolesLabel(agent.info)}</span>
          <a class="btn subtle" href={agent.href}>Open</a>
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

  .header,
  .table-head,
  .table-row {
    display: grid;
    grid-template-columns: 1.5fr 0.75fr 0.9fr 1.2fr auto;
    gap: 1rem;
    align-items: center;
  }

  .header {
    display: flex;
    justify-content: space-between;
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

  .table-card {
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
    overflow: hidden;
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

  .running {
    color: var(--success);
    font-weight: 700;
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
  }

  .btn.subtle {
    text-align: center;
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
    .table-head {
      display: none;
    }

    .table-row {
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }
  }
</style>
