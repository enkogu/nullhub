<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api/client";

  type RoleRow = {
    role: string;
    agents: string[];
    source: string;
  };

  const defaultRoles: RoleRow[] = [
    { role: "operator", agents: [], source: "Built-in" },
    { role: "planner", agents: [], source: "Built-in" },
    { role: "reviewer", agents: [], source: "Built-in" },
    { role: "integrator", agents: [], source: "Built-in" },
    { role: "observer", agents: [], source: "Built-in" },
  ];

  let rows = $state<RoleRow[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  function rolesFrom(value: any): string[] {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  }

  async function refresh() {
    loading = true;
    error = null;
    try {
      const status = await api.getStatus();
      const agents = Object.entries((status?.instances?.nullclaw || {}) as Record<string, any>);
      const grouped = new Map<string, RoleRow>(defaultRoles.map((row) => [row.role, { ...row }]));
      for (const [name, info] of agents) {
        const config = await api.getConfig("nullclaw", name).catch(() => null);
        const roles = [
          ...rolesFrom(info?.roles),
          ...rolesFrom(info?.metadata?.roles),
          ...rolesFrom(info?.config?.roles),
          ...rolesFrom(config?.agent?.roles),
          ...rolesFrom(config?.roles),
        ];
        for (const role of new Set(roles)) {
          const row = grouped.get(role) || { role, agents: [], source: "" };
          row.agents = [...new Set([...row.agents, name])].sort();
          row.source = "Agent config";
          grouped.set(role, row);
        }
      }
      rows = [...grouped.values()].sort((a, b) => a.role.localeCompare(b.role));
    } catch (err) {
      rows = [];
      error = (err as Error).message || "Failed to load roles.";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void refresh();
  });
</script>

<div class="page">
  <div class="header">
    <h1>Roles</h1>
    <button class="btn" onclick={refresh} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
  </div>

  {#if error}<div class="error-banner">ERR: {error}</div>{/if}

  <div class="table-card">
    <div class="table-head"><span>Role</span><span>Agents</span><span>Source</span></div>
    {#if rows.length === 0}
      <div class="empty-row">{loading ? "Loading..." : "No roles"}</div>
    {:else}
      {#each rows as row (row.role)}
        <div class="table-row">
          <strong>{row.role}</strong>
          <span>{row.agents.length > 0 ? row.agents.join(", ") : "-"}</span>
          <span>{row.source}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1.25rem; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--shadcn-border); }
  h1 { margin: 0; font-size: 1.875rem; font-weight: 600; letter-spacing: 0; }
  .table-card { border: 1px solid var(--shadcn-border); border-radius: var(--shadcn-radius); background: var(--shadcn-card); overflow: hidden; }
  .table-head, .table-row { display: grid; grid-template-columns: 1fr 1.5fr 1fr; gap: 1rem; align-items: center; }
  .table-head { padding: 0.75rem 1rem; color: var(--shadcn-muted-foreground); border-bottom: 1px solid var(--shadcn-border); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
  .table-row { padding: 0.875rem 1rem; border-bottom: 1px solid var(--shadcn-border); }
  .table-row:last-child { border-bottom: 0; }
  .table-row span, .table-row strong { overflow-wrap: anywhere; }
  .btn { min-height: 2.25rem; padding: 0.5rem 0.875rem; border: 1px solid var(--shadcn-input); border-radius: var(--shadcn-radius); background: var(--shadcn-background); color: var(--shadcn-foreground); font-size: 0.875rem; font-weight: 500; }
  .btn:hover { background: var(--shadcn-accent); }
  .error-banner, .empty-row { padding: 1rem; }
  .error-banner { color: var(--shadcn-destructive); border: 1px solid color-mix(in srgb, var(--shadcn-destructive) 25%, var(--shadcn-border)); border-radius: var(--shadcn-radius); }
  .empty-row { color: var(--shadcn-muted-foreground); }
</style>
