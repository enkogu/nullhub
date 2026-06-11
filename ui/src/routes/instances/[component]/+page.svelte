<script lang="ts">
  import { page } from "$app/stores";
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { pollWhileVisible } from "$lib/poll";
  import { canStartInstanceStatus, canStopInstanceStatus } from "$lib/nullstack/instanceStatus";
  import { encodePathSegment, instanceRoute } from "$lib/nullstack/path";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";

  type ComponentAction = {
    label: string;
    href: string;
  };

  let component = $derived($page.params.component);
  let status = $state<any>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let stopPolling: (() => void) | null = null;

  let componentInstances = $derived((status?.instances?.[component] || {}) as Record<string, any>);
  let instanceEntries = $derived(
    Object.entries(componentInstances).sort(([a], [b]) => a.localeCompare(b)),
  );
  let displayName = $derived(displayNameForComponent(component));
  let installHref = $derived(`/market/install/${encodePathSegment(component)}`);
  let runningCount = $derived(
    instanceEntries.filter(([, info]) => info?.status === "running").length,
  );
  let stoppedCount = $derived(Math.max(instanceEntries.length - runningCount, 0));
  let actions = $derived(componentActions(component));

  const instanceColumns: EntityColumn[] = [
    { id: "status", label: "Status", type: "status", width: "minmax(112px,.4fr)" },
    { id: "version", label: "Version", type: "mono", width: "minmax(110px,.36fr)" },
    { id: "port", label: "Port", type: "number", width: "minmax(90px,.3fr)" },
    { id: "auto_start", label: "Auto start", type: "select", width: "minmax(112px,.36fr)" },
  ];
  const instanceViews = createViewSet({
    kanban: { groupBy: "status" },
    tree: { parentField: "status" },
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
        await api.startInstance(component, String(record.fields?.name || ""));
        await refresh();
      },
    },
    {
      id: "stop",
      label: "Stop",
      variant: "destructive",
      visible: (record) => canStopInstanceStatus(record.status),
      run: async (record) => {
        await api.stopInstance(component, String(record.fields?.name || ""));
        await refresh();
      },
    },
  ];
  let instanceRecords = $derived(
    instanceEntries.map(([name, info]) => ({
      id: `instance:${component}:${name}`,
      title: name,
      type: "instance",
      status: info?.status || "stopped",
      subtitle: displayName,
      description: info?.port ? `127.0.0.1:${info.port}` : `Version ${info?.version || "-"}`,
      href: instanceRoute(component, name),
      parentId: info?.status || "stopped",
      fields: {
        name,
        status: info?.status || "stopped",
        version: info?.version || "-",
        port: info?.port || 0,
        auto_start: info?.auto_start ? "yes" : "no",
        updated: info?.updated_at || info?.updated || "",
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

  function displayNameForComponent(value: string): string {
    const names: Record<string, string> = {
      nullclaw: "NullClaw",
      nullboiler: "NullBoiler",
      nulltickets: "NullTickets",
      nullwatch: "NullWatch",
    };
    return names[value] || value;
  }

  function componentActions(value: string): ComponentAction[] {
    if (value === "nullboiler") {
      return [
        { label: "Dashboard", href: "/orders/workflows" },
        { label: "Workflows", href: "/orders/workflows" },
        { label: "Runs", href: "/orders/workflows/runs" },
      ];
    }
    if (value === "nulltickets") {
      return [{ label: "Store", href: "/market/nulltickets/store" }];
    }
    if (value === "nullwatch") {
      return [{ label: "Flight Recorder", href: "/system/observability" }];
    }
    return [];
  }

  onMount(() => {
    void refresh();
    stopPolling = pollWhileVisible(refresh, 5000);
  });

  onDestroy(() => stopPolling?.());
</script>

<div class="component-page">
  <div class="top-row">
    <div class="stats">
      <div class="stat">
        <span>Running</span>
        <strong>{runningCount}</strong>
      </div>
      <div class="stat">
        <span>Stopped</span>
        <strong>{stoppedCount}</strong>
      </div>
      <div class="stat">
        <span>Total</span>
        <strong>{instanceEntries.length}</strong>
      </div>
    </div>
    <div class="header-actions">
      {#each actions as action}
        <a href={action.href} class="action-btn">{action.label}</a>
      {/each}
      <a href={installHref} class="action-btn primary">Install Instance</a>
    </div>
  </div>

  <UniversalEntityView
    title={displayName}
    description={`${instanceEntries.length} installed instances for ${displayName}.`}
    records={instanceRecords}
    columns={instanceColumns}
    views={instanceViews}
    defaultViewId="cards"
    {loading}
    {error}
    actions={instanceActions}
    emptyTitle={`No ${displayName} instances`}
    emptyDescription={`Install ${displayName} to populate this collection.`}
    onRefresh={refresh}
  />
</div>

<style>
  .component-page {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .top-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
    width: min(100%, 32rem);
  }

  .stat {
    display: flex;
    min-height: 4rem;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0.75rem;
    background: var(--shadcn-card);
  }

  .stat span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }

  .stat strong {
    color: var(--shadcn-foreground);
    font-family: var(--font-mono);
    font-size: 1.35rem;
  }

  .header-actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .action-btn {
    display: inline-flex;
    min-height: 2.25rem;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--shadcn-input);
    border-radius: var(--shadcn-radius);
    padding: 0 0.875rem;
    background: var(--shadcn-background);
    color: var(--shadcn-foreground);
    font-size: 0.8125rem;
    font-weight: 500;
    text-decoration: none;
  }

  .action-btn:hover {
    background: var(--shadcn-accent);
  }

  .action-btn.primary {
    border-color: color-mix(in srgb, var(--shadcn-foreground) 18%, var(--shadcn-border));
    background: var(--shadcn-foreground);
    color: var(--shadcn-background);
  }

  @media (max-width: 860px) {
    .top-row {
      flex-direction: column;
    }

    .stats {
      width: 100%;
      grid-template-columns: 1fr;
    }

    .header-actions {
      justify-content: flex-start;
    }
  }
</style>
