<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import InstanceCard from "$lib/components/InstanceCard.svelte";
  import { api } from "$lib/api/client";

  let status = $state<any>(null);
  let error = $state<string | null>(null);
  let interval: ReturnType<typeof setInterval>;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  async function refresh() {
    try {
      status = await api.getStatus();
      error = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  onMount(() => {
    refreshTimer = setTimeout(() => void refresh(), 350);
    interval = setInterval(refresh, 5000);
  });

  onDestroy(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
    clearInterval(interval);
  });
</script>

<div class="dashboard">
  <div class="header">
    <h1>Home</h1>
    <a href="/inventory/components" class="install-btn">Components</a>
  </div>

  {#if error}
    <div class="error-banner">ERR: {error}</div>
  {/if}

  {#if status}
    <div class="instance-grid">
      {#each Object.entries(status.instances || {}) as [component, instances]}
        {#each Object.entries(instances as Record<string, any>) as [name, info]}
          <InstanceCard
            {component}
            {name}
            version={info.version}
            status={info.status || "stopped"}
            autoStart={info.auto_start}
            port={info.port || 0}
            onAction={refresh}
          />
        {/each}
      {/each}
    </div>

    {#if Object.keys(status.instances || {}).length === 0}
      <div class="empty-state">
        <p>> No instances installed yet.</p>
        <a href="/inventory/components" class="btn">Open Components</a>
      </div>
    {/if}
  {/if}
</div>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 0;
    max-width: none;
    margin: 0;
  }

  .header {
    display: flex;
    align-items: center;
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
    line-height: 1.2;
    text-shadow: none;
    text-transform: none;
  }

  .install-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.25rem;
    padding: 0.5rem 0.875rem;
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    border: 1px solid var(--shadcn-input);
    border-radius: var(--shadcn-radius);
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: 0;
    line-height: 1;
    text-shadow: none;
    text-transform: none;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .install-btn:hover {
    text-decoration: none;
    background: var(--shadcn-accent);
    border-color: var(--shadcn-border);
    box-shadow: none;
    text-shadow: none;
  }

  .error-banner {
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--shadcn-destructive) 8%, transparent);
    color: var(--shadcn-destructive);
    border: 1px solid color-mix(in srgb, var(--shadcn-destructive) 25%, var(--shadcn-border));
    border-radius: var(--shadcn-radius);
    font-size: 0.875rem;
    font-weight: 500;
    text-shadow: none;
    box-shadow: none;
    animation: none;
  }

  .instance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--shadcn-muted-foreground);
    border: 1px dashed var(--shadcn-border);
    background: var(--shadcn-card);
    border-radius: var(--shadcn-radius);
  }

  .empty-state p {
    margin-bottom: 1.5rem;
    font-size: 0.9375rem;
    font-family: var(--shadcn-font-sans);
  }

  .empty-state .btn {
    display: inline-block;
    padding: 0.625rem 1rem;
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    border: 1px solid var(--shadcn-input);
    border-radius: var(--shadcn-radius);
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: 0;
    text-shadow: none;
    text-transform: none;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .empty-state .btn:hover {
    text-decoration: none;
    background: var(--shadcn-accent);
    border-color: var(--shadcn-border);
    box-shadow: none;
    text-shadow: none;
  }
</style>
