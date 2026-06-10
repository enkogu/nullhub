<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { pollWhileVisible } from "$lib/poll";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";

  let status = $state<any>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let stopPolling: (() => void) | null = null;

  const agentColumns: EntityColumn[] = [
    { id: "status", label: "Status", type: "status", width: "minmax(120px,.42fr)" },
    { id: "profile", label: "Profile", type: "select", width: "minmax(140px,.5fr)" },
    { id: "roles", label: "Roles", type: "tags", width: "minmax(220px,1fr)" },
    { id: "version", label: "Version", type: "mono", width: "minmax(110px,.4fr)" },
  ];
  const agentViews = createViewSet({
    kanban: { groupBy: "status" },
    tree: { parentField: "profile" },
    timeline: { dateField: "updated" },
    calendar: { dateField: "updated" },
  });
  const agentActions: EntityViewAction[] = [
    { id: "open", label: "Open", variant: "default", href: (record) => record.href || "#" },
  ];

  const agents = $derived(
    Object.entries((status?.instances?.nullclaw || {}) as Record<string, any>).map(([name, info]) => ({
      name,
      info,
      href: `/instances/nullclaw/${encodeURIComponent(name)}`,
    })),
  );
  const agentRecords = $derived(
    agents.map((agent) => ({
      id: `agent:${agent.name}`,
      title: agent.name,
      type: "agent",
      status: statusLabel(agent.info),
      subtitle: profileLabel(agent.info),
      description: rolesLabel(agent.info),
      href: agent.href,
      fields: {
        status: statusLabel(agent.info),
        profile: profileLabel(agent.info),
        roles: rolesLabel(agent.info) === "-" ? [] : rolesLabel(agent.info).split(",").map((role) => role.trim()).filter(Boolean),
        version: agent.info?.version || "-",
        updated: agent.info?.updated_at || agent.info?.updated || "",
      },
    })) satisfies EntityRecord[],
  );

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
    stopPolling = pollWhileVisible(refresh, 5000);
  });

  onDestroy(() => stopPolling?.());
</script>

<div class="page">
  <UniversalEntityView
    title="Agents"
    description="Live NullClaw agents with profiles, roles, status, and instance links."
    records={agentRecords}
    columns={agentColumns}
    views={agentViews}
    defaultViewId="table"
    {loading}
    {error}
    actions={agentActions}
    emptyTitle="No agents"
    emptyDescription="Deploy a NullClaw instance to populate this collection."
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
