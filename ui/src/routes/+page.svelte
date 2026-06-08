<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import InstanceCard from "$lib/components/InstanceCard.svelte";
  import { api } from "$lib/api/client";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Card } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";

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
  <PageHeader title="Instances" subtitle="Components installed in this workspace and their runtime status.">
    {#snippet actions()}
      <Button href="/install">Install component</Button>
    {/snippet}
  </PageHeader>

  {#if error}
    <div class="banner banner-error">{error}</div>
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
      <Card class="px-5">
        <div class="empty-state">
          <p>No instances installed yet.</p>
          <Button variant="outline" href="/install">Install component</Button>
        </div>
      </Card>
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

  .banner {
    padding: 0.75rem 1rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
    font-size: 0.875rem;
    color: var(--shadcn-foreground);
  }

  .banner-error {
    border-color: var(--shadcn-destructive);
    color: var(--shadcn-destructive);
    background: color-mix(in srgb, var(--shadcn-destructive) 8%, transparent);
  }

  .instance-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2.5rem 1rem;
    text-align: center;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.9375rem;
    color: var(--shadcn-muted-foreground);
  }
</style>
