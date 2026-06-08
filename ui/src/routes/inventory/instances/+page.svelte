<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import InstanceCard from "$lib/components/InstanceCard.svelte";
  import { api } from "$lib/api/client";

  let status = $state<any>(null);
  let error = $state<string | null>(null);
  let interval: ReturnType<typeof setInterval>;

  async function refresh() {
    try {
      status = await api.getStatus();
      error = null;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  onMount(() => {
    void refresh();
    interval = setInterval(refresh, 5000);
  });

  onDestroy(() => clearInterval(interval));
</script>

<div class="dashboard">
  <div class="header">
    <h1>Instances</h1>
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
      <div class="empty-state">No instances</div>
    {/if}
  {/if}
</div>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
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
  }

  .install-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.25rem;
    padding: 0.5rem 0.875rem;
    border: 1px solid var(--shadcn-input);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
  }

  .install-btn:hover {
    background: var(--shadcn-accent);
  }

  .instance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  .error-banner,
  .empty-state {
    padding: 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
  }

  .error-banner {
    color: var(--shadcn-destructive);
    border-color: color-mix(in srgb, var(--shadcn-destructive) 25%, var(--shadcn-border));
  }

  .empty-state {
    color: var(--shadcn-muted-foreground);
  }
</style>
