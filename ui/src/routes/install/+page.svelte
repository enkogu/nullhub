<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { api } from "$lib/api/client";
  import { encodePathSegment } from "$lib/nullstack/path";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";

  const fallbackComponents = [
    {
      name: "nullclaw",
      display_name: "NullClaw",
      description: "Autonomous AI agent runtime. Connects to LLM providers, runs tools, manages memory, and exposes a gateway API.",
      alpha: false,
      stage: "",
      installable: true,
      instance_count: 0,
    },
    {
      name: "nullboiler",
      display_name: "NullBoiler",
      description: "DAG-based workflow orchestrator for multi-step agent pipelines.",
      alpha: false,
      stage: "beta",
      installable: true,
      instance_count: 0,
    },
    {
      name: "nulltickets",
      display_name: "NullTickets",
      description: "Task and issue tracker for AI agents.",
      alpha: false,
      stage: "beta",
      installable: true,
      instance_count: 0,
    },
    {
      name: "nullwatch",
      display_name: "NullWatch",
      description: "Headless tracing, evals, and run intelligence for agent infrastructure.",
      alpha: true,
      stage: "alpha",
      installable: true,
      instance_count: 0,
    },
  ];

  let components = $state<any[]>(fallbackComponents);
  let loadTimer: ReturnType<typeof setTimeout> | null = null;
  let loading = $state(false);

  const componentColumns: EntityColumn[] = [
    { id: "stage", label: "Stage", type: "select", width: "minmax(110px,.36fr)" },
    { id: "installed", label: "Installed", type: "status", width: "minmax(130px,.42fr)" },
    { id: "instances", label: "Instances", type: "number", width: "minmax(110px,.32fr)" },
    { id: "installable", label: "Installable", type: "select", width: "minmax(120px,.36fr)" },
  ];
  const componentViews = createViewSet({
    kanban: { groupBy: "stage" },
    tree: { parentField: "stage" },
  });
  const componentActions: EntityViewAction[] = [
    {
      id: "install",
      label: "Install",
      variant: "default",
      visible: (record) => record.fields?.installable !== "coming soon",
      href: (record) => `/market/install/${encodePathSegment(String(record.fields?.name || record.title))}`,
    },
  ];
  let componentRecords = $derived(
    components.map((component) => {
      const stage = String(component.stage || (component.alpha ? "alpha" : "stable")).toLowerCase();
      const instanceCount = Number(component.instance_count || 0);
      return {
        id: `component:${component.name}`,
        title: component.display_name || component.name,
        type: "component",
        status: instanceCount > 0 ? "active" : component.installable === false ? "disabled" : "available",
        subtitle: stage,
        description: component.description,
        href: component.installable === false && instanceCount === 0 ? undefined : `/market/install/${encodePathSegment(component.name)}`,
        fields: {
          name: component.name,
          stage,
          installed: instanceCount > 0 ? "active" : "not installed",
          instances: instanceCount,
          installable: component.installable === false && instanceCount === 0 ? "coming soon" : "yes",
        },
        raw: component,
      };
    }) satisfies EntityRecord[],
  );

  async function loadPageData() {
    loading = true;
    try {
      const data = await api.getComponents();
      components = data.components || [];
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadTimer = setTimeout(() => void loadPageData(), 350);
  });

  onDestroy(() => {
    if (loadTimer) clearTimeout(loadTimer);
  });
</script>

<div class="install-page">
  <UniversalEntityView
    title="Component Catalog"
    description="Installable NullStack components and their local instance coverage."
    records={componentRecords}
    columns={componentColumns}
    views={componentViews}
    defaultViewId="cards"
    {loading}
    actions={componentActions}
    emptyTitle="No components"
    emptyDescription="Component catalog data is not available."
    onRefresh={loadPageData}
  />
</div>

<style>
  .install-page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 1120px;
  }

</style>
