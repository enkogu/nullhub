<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { canStartInstanceStatus, canStopInstanceStatus } from "$lib/nullstack/instanceStatus";
  import { instanceRoute } from "$lib/nullstack/path";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";

  let status = $state<any>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let interval: ReturnType<typeof setInterval>;

  const instanceColumns: EntityColumn[] = [
    { id: "component", label: "Component", type: "select", width: "minmax(130px,.45fr)" },
    { id: "status", label: "Status", type: "status", width: "minmax(112px,.4fr)" },
    { id: "version", label: "Version", type: "mono", width: "minmax(110px,.36fr)" },
    { id: "port", label: "Port", type: "number", width: "minmax(90px,.3fr)" },
    { id: "auto_start", label: "Auto start", type: "select", width: "minmax(112px,.36fr)" },
  ];
  const instanceViews = createViewSet({
    kanban: { groupBy: "status" },
    tree: { parentField: "component" },
    timeline: { dateField: "updated" },
    calendar: { dateField: "updated" },
  });
  const instanceActions: EntityViewAction[] = [
    { id: "open", label: "Open", variant: "default", href: (record) => record.href || "#" },
    {
      id: "start",
      label: "Start",
      visible: (record) => canStartInstanceStatus(record.status),
      run: async (record) => {
        await api.startInstance(String(record.fields?.component || ""), String(record.fields?.name || ""));
        await refresh();
      },
    },
    {
      id: "stop",
      label: "Stop",
      variant: "destructive",
      visible: (record) => canStopInstanceStatus(record.status),
      run: async (record) => {
        await api.stopInstance(String(record.fields?.component || ""), String(record.fields?.name || ""));
        await refresh();
      },
    },
  ];

  let instanceRecords = $derived(
    Object.entries((status?.instances || {}) as Record<string, Record<string, any>>).flatMap(([component, instances]) =>
      Object.entries(instances || {}).map(([name, info]) => ({
        id: `instance:${component}:${name}`,
        title: name,
        type: "instance",
        status: info?.status || "stopped",
        subtitle: component,
        description: info?.port ? `127.0.0.1:${info.port}` : `Version ${info?.version || "-"}`,
        href: instanceRoute(component, name),
        parentId: component,
        fields: {
          component,
          name,
          status: info?.status || "stopped",
          version: info?.version || "-",
          port: info?.port || 0,
          auto_start: info?.auto_start ? "yes" : "no",
          updated: info?.updated_at || info?.updated || "",
        },
      })),
    ) satisfies EntityRecord[],
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

  onMount(() => {
    void refresh();
    interval = setInterval(refresh, 5000);
  });

  onDestroy(() => clearInterval(interval));
</script>

<div class="dashboard">
  <UniversalEntityView
    title="Instances"
    description="All installed NullStack component instances across the local workspace."
    records={instanceRecords}
    columns={instanceColumns}
    views={instanceViews}
    defaultViewId="cards"
    {loading}
    {error}
    actions={instanceActions}
    emptyTitle="No instances"
    emptyDescription="Install a component instance to populate this inventory."
    onRefresh={refresh}
  />
</div>

<style>
  .dashboard {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
</style>
