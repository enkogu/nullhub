<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { pollWhileVisible } from "$lib/poll";
  import AgentCard from "$lib/components/AgentCard.svelte";
  import HireWizard from "$lib/components/HireWizard.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { PageHeader } from "$lib/components/ui/page-header";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  type AgentInfo = Record<string, any>;

  let status = $state<any>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let stopPolling: (() => void) | null = null;

  const teamTabs = [
    { label: "Agents", href: "/team/agents" },
    { label: "Profiles", href: "/team/agents/profiles" },
    { label: "Roles", href: "/team/agents/roles" },
    { label: "Skills", href: "/team/capabilities/skills" },
    { label: "Knowledge", href: "/team/capabilities/memory" },
    { label: "Integrations", href: "/team/capabilities/mcp" },
  ];

  const statusOrder: Record<string, number> = {
    running: 0,
    starting: 1,
    restarting: 2,
    stopped: 3,
    failed: 4,
  };

  const agentCards = $derived(
    Object.entries((status?.instances?.nullclaw || {}) as Record<string, AgentInfo>)
      .sort(([aName, aInfo], [bName, bInfo]) => {
        const aRank = statusOrder[statusLabel(aInfo)] ?? 99;
        const bRank = statusOrder[statusLabel(bInfo)] ?? 99;
        if (aRank !== bRank) return aRank - bRank;
        return aName.localeCompare(bName);
      })
      .map(([name, info]) => ({
        name,
        href: `/team/instances/nullclaw/${encodeURIComponent(name)}`,
        status: statusLabel(info),
        role: roleLabel(info),
        currentWork: currentWorkLabel(info),
        dailyCost: dailyCostLabel(info),
        sourceKit: sourceKitLabel(info),
      })),
  );

  const runningCount = $derived(agentCards.filter((agent) => agent.status === "running").length);
  const stoppedCount = $derived(agentCards.filter((agent) => agent.status !== "running").length);

  async function refresh() {
    loading = true;
    try {
      status = await api.getStatus();
      error = null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function statusLabel(info: AgentInfo): string {
    return typeof info?.status === "string" && info.status.trim() ? info.status : "stopped";
  }

  function roleLabel(info: AgentInfo): string {
    const configRole = info?.profile || info?.role || info?.metadata?.role || info?.launch_mode;
    return typeof configRole === "string" && configRole.trim() ? configRole : "agent";
  }

  function currentWorkLabel(info: AgentInfo): string {
    if (statusLabel(info) !== "running") return "Idle";
    const version = typeof info?.version === "string" && info.version.trim() ? info.version : "latest";
    const port = Number(info?.port || 0) || 0;
    return port > 0 ? `Running on ${version} - port ${port}` : `Running on ${version}`;
  }

  function dailyCostLabel(info: AgentInfo): string {
    return statusLabel(info) === "running" ? "$0.00/day" : "$0.00/day";
  }

  function sourceKitLabel(info: AgentInfo): string {
    return typeof info?.version === "string" && info.version.trim() ? info.version : "local";
  }

  async function handleHireComplete() {
    await refresh();
  }

  onMount(() => {
    void refresh();
    stopPolling = pollWhileVisible(refresh, 5000);
  });

  onDestroy(() => stopPolling?.());
</script>

<div class="team-agents-page">
  <PageHeader
    title="Agents"
    subtitle="Build the active staff set, inspect live instances, and launch new hires."
  >
    {#snippet actions()}
      <Button variant="outline" size="sm" onclick={() => void refresh()} disabled={loading}>
        <RefreshCwIcon class="size-4" aria-hidden="true" />
        Refresh
      </Button>
    {/snippet}
  </PageHeader>

  <nav class="team-tabs" aria-label="Team sections">
    {#each teamTabs as tab (tab.href)}
      <Button href={tab.href} variant="outline" size="sm" class="team-tab">
        {tab.label}
      </Button>
    {/each}
  </nav>

  {#if error}
    <div class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {error}
    </div>
  {/if}

  <section class="summary-grid" aria-label="Agent summary">
    <Badge variant="secondary" class="summary-chip">Running {runningCount}</Badge>
    <Badge variant="secondary" class="summary-chip">Stopped {stoppedCount}</Badge>
    <Badge variant="secondary" class="summary-chip">Total {agentCards.length}</Badge>
  </section>

  <section class="content-grid">
    <div class="space-y-4">
      {#if loading && agentCards.length === 0}
        <div class="rounded-lg border bg-card px-4 py-4 text-sm text-muted-foreground">
          Loading agents...
        </div>
      {:else if agentCards.length === 0}
        <div class="rounded-lg border bg-card px-4 py-4 text-sm text-muted-foreground">
          No NullClaw agents found.
        </div>
      {:else}
        <div class="agent-grid">
          {#each agentCards as agent (agent.name)}
            <AgentCard {...agent} />
          {/each}
        </div>
      {/if}
    </div>

    <aside class="hire-panel" id="hire">
      <HireWizard
        component="nullclaw"
        existingNames={agentCards.map((agent) => agent.name)}
        onCreated={handleHireComplete}
      />
    </aside>
  </section>
</div>

<style>
  .team-agents-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .team-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .summary-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .content-grid {
    display: grid;
    gap: 1rem;
    align-items: start;
    grid-template-columns: minmax(0, 1.55fr) minmax(20rem, 0.95fr);
  }

  .agent-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  }

  .hire-panel {
    position: sticky;
    top: 1rem;
  }

  @media (max-width: 1024px) {
    .content-grid {
      grid-template-columns: 1fr;
    }

    .hire-panel {
      position: static;
    }
  }
</style>
