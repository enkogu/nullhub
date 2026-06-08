<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { UniversalEntityView, createViewSet, type EntityColumn, type EntityRecord } from "$lib/entity-view";

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

  let rows = $state<RoleRow[]>(defaultRoles.map((row) => ({ ...row })));
  let loading = $state(false);
  let error = $state<string | null>(null);
  let refreshToken = 0;
  let detailLoadTimer: ReturnType<typeof setTimeout> | null = null;
  const roleColumns: EntityColumn[] = [
    { id: "agent_count", label: "Agents", type: "number", width: "minmax(96px,.35fr)" },
    { id: "agents", label: "Assigned agents", type: "tags", width: "minmax(220px,1fr)" },
    { id: "source", label: "Source", type: "status", width: "minmax(140px,.5fr)" },
  ];
  const roleViews = createViewSet({
    kanban: { groupBy: "source" },
    tree: { parentField: "source" },
    timeline: { dateField: "updated" },
    calendar: { dateField: "updated" },
  });
  let roleRecords = $derived<EntityRecord[]>(
    rows.map((row) => ({
      id: `role:${row.role}`,
      title: row.role,
      type: "role",
      status: row.source || "Ad hoc",
      subtitle: `${row.agents.length} assigned agents`,
      description: row.agents.length > 0 ? row.agents.join(", ") : "Built-in role with no assigned agents yet.",
      fields: {
        agent_count: row.agents.length,
        agents: row.agents.length > 0 ? row.agents : ["-"],
        source: row.source || "Ad hoc",
        updated: "",
      },
    })),
  );

  function rolesFrom(value: any): string[] {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === "string" && value.trim()) return [value.trim()];
    return [];
  }

  async function loadAgentRoles(agents: [string, any][], token: number) {
    const grouped = new Map<string, RoleRow>(defaultRoles.map((row) => [row.role, { ...row }]));
      const configs = await Promise.all(
        agents.map(async ([name, info]) => ({
          name,
          info,
          config: await api.getConfig("nullclaw", name).catch(() => null),
        })),
      );
      for (const { name, info, config } of configs) {
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
    if (token === refreshToken) {
      rows = [...grouped.values()].sort((a, b) => a.role.localeCompare(b.role));
    }
  }

  async function refresh() {
    const token = ++refreshToken;
    loading = true;
    error = null;
    rows = defaultRoles.map((row) => ({ ...row }));
    try {
      const status = await api.getStatus();
      if (token !== refreshToken) return;
      const agents = Object.entries((status?.instances?.nullclaw || {}) as Record<string, any>);
      loading = false;
      if (detailLoadTimer) clearTimeout(detailLoadTimer);
      detailLoadTimer = setTimeout(() => void loadAgentRoles(agents, token), 350);
    } catch (err) {
      error = (err as Error).message || "Failed to load roles.";
      loading = false;
    } finally {
      if (token === refreshToken && rows.length === 0) loading = false;
    }
  }

  onMount(() => {
    void refresh();
  });

  onDestroy(() => {
    refreshToken += 1;
    if (detailLoadTimer) clearTimeout(detailLoadTimer);
  });
</script>

<div class="page">
  <UniversalEntityView
    title="Roles"
    description="Built-in and agent-defined runtime roles."
    records={roleRecords}
    columns={roleColumns}
    views={roleViews}
    defaultViewId="table"
    {loading}
    {error}
    emptyTitle="No roles"
    emptyDescription="Roles appear here from built-ins and agent configuration."
    onRefresh={refresh}
  />
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
</style>
