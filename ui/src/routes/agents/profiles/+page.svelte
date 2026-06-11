<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { UniversalEntityView, createViewSet, type EntityColumn, type EntityRecord } from "$lib/entity-view";

  type ProfileRow = {
    profile: string;
    agents: string[];
    source: string;
  };

  const defaultProfiles: ProfileRow[] = [
    { profile: "default", agents: [], source: "Built-in" },
    { profile: "engineering", agents: [], source: "Built-in" },
    { profile: "operations", agents: [], source: "Built-in" },
    { profile: "research", agents: [], source: "Built-in" },
    { profile: "support", agents: [], source: "Built-in" },
  ];

  let rows = $state<ProfileRow[]>(defaultProfiles.map((row) => ({ ...row })));
  let loading = $state(false);
  let error = $state<unknown>(null);
  let refreshToken = 0;
  let detailLoadTimer: ReturnType<typeof setTimeout> | null = null;
  const profileColumns: EntityColumn[] = [
    { id: "agent_count", label: "Agents", type: "number", width: "minmax(96px,.35fr)" },
    { id: "agents", label: "Assigned agents", type: "tags", width: "minmax(220px,1fr)" },
    { id: "source", label: "Source", type: "status", width: "minmax(140px,.5fr)" },
  ];
  const profileViews = createViewSet({
    kanban: { groupBy: "source" },
    tree: { parentField: "source" },
    timeline: { dateField: "updated" },
    calendar: { dateField: "updated" },
  });
  let profileRecords = $derived<EntityRecord[]>(
    rows.map((row) => ({
      id: `profile:${row.profile}`,
      title: row.profile,
      type: "profile",
      status: row.source || "Ad hoc",
      subtitle: `${row.agents.length} assigned agents`,
      description: row.agents.length > 0 ? row.agents.join(", ") : "Built-in profile with no assigned agents yet.",
      fields: {
        agent_count: row.agents.length,
        agents: row.agents.length > 0 ? row.agents : ["-"],
        source: row.source || "Ad hoc",
        updated: "",
      },
    })),
  );

  function profileFrom(...values: any[]): string {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  async function loadAgentProfiles(agents: [string, any][], token: number) {
    const grouped = new Map<string, ProfileRow>(defaultProfiles.map((row) => [row.profile, { ...row }]));
      const configs = await Promise.all(
        agents.map(async ([name, info]) => ({
          name,
          info,
          config: await api.getConfig("nullclaw", name).catch(() => null),
        })),
      );
      for (const { name, info, config } of configs) {
        const profile = profileFrom(
          info?.profile,
          info?.metadata?.profile,
          info?.config?.profile,
          config?.agent?.profile,
          config?.profile,
        );
        if (!profile) continue;
        const row = grouped.get(profile) || { profile, agents: [], source: "Built-in" };
        row.agents = [...new Set([...row.agents, name])].sort();
        row.source = "Agent config";
        grouped.set(profile, row);
      }
    if (token === refreshToken) {
      rows = [...grouped.values()].sort((a, b) => a.profile.localeCompare(b.profile));
    }
  }

  async function refresh() {
    const token = ++refreshToken;
    loading = true;
    error = null;
    rows = defaultProfiles.map((row) => ({ ...row }));
    try {
      const status = await api.getStatus();
      if (token !== refreshToken) return;
      const agents = Object.entries((status?.instances?.nullclaw || {}) as Record<string, any>);
      loading = false;
      if (detailLoadTimer) clearTimeout(detailLoadTimer);
      detailLoadTimer = setTimeout(() => void loadAgentProfiles(agents, token), 350);
    } catch (err) {
      error = err || "Failed to load profiles.";
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
    title="Profiles"
    description="Reusable agent profile groupings from defaults and live config."
    records={profileRecords}
    columns={profileColumns}
    views={profileViews}
    defaultViewId="table"
    {loading}
    {error}
    emptyTitle="No profiles"
    emptyDescription="Profiles appear here from built-ins and agent configuration."
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
