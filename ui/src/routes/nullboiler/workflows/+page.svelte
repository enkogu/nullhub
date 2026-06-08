<script lang="ts">
  import { onMount } from "svelte";
  import { nullBoilerApi } from "$lib/api/client";
  import { nullboilerUiRoutes } from "$lib/nullboiler/routes";
  import BoilerInstanceSelector from "$lib/components/nullboiler/BoilerInstanceSelector.svelte";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";

  let workflows = $state<any[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let deleteConfirm = $state<string | null>(null);

  const workflowColumns: EntityColumn[] = [
    { id: "nodes", label: "Nodes", type: "number", width: "minmax(96px,.32fr)" },
    { id: "id", label: "ID", type: "mono", width: "minmax(180px,.7fr)" },
    { id: "updated", label: "Updated", type: "date", width: "minmax(150px,.52fr)" },
  ];
  const workflowViews = createViewSet({
    kanban: { groupBy: "node_range" },
    tree: { parentField: "node_range" },
    timeline: { dateField: "updated" },
    calendar: { dateField: "updated" },
  });
  const workflowActions: EntityViewAction[] = [
    { id: "edit", label: "Edit", variant: "default", href: (record) => record.href || "#" },
    {
      id: "delete",
      label: "Delete",
      variant: "destructive",
      visible: (record) => deleteConfirm !== workflowId(record),
      run: (record) => {
        deleteConfirm = workflowId(record);
      },
    },
    {
      id: "confirm-delete",
      label: "Confirm",
      variant: "destructive",
      visible: (record) => deleteConfirm === workflowId(record),
      run: async (record) => deleteWorkflow(workflowId(record)),
    },
    {
      id: "cancel-delete",
      label: "Cancel",
      visible: (record) => deleteConfirm === workflowId(record),
      run: () => {
        deleteConfirm = null;
      },
    },
  ];

  const workflowRecords = $derived(
    workflows.map((workflow) => {
      const id = String(workflow.id || workflow.name || "");
      const nodes = nodeCount(workflow);
      return {
        id: `workflow:${id}`,
        title: workflow.name || id,
        type: "workflow",
        subtitle: id,
        description: `${nodes} nodes`,
        href: workflowHref(id),
        date: workflow.updated_at || workflow.created_at || "",
        fields: {
          id,
          nodes,
          node_range: nodeRange(nodes),
          updated: workflow.updated_at || workflow.created_at || "",
          created: workflow.created_at || "",
        },
        raw: workflow,
      };
    }) satisfies EntityRecord[],
  );

  async function loadWorkflows() {
    loading = true;
    try {
      workflows = (await nullBoilerApi.listWorkflows()) || [];
      error = null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadWorkflows();
  });

  async function deleteWorkflow(id: string) {
    if (!id) return;
    try {
      await nullBoilerApi.deleteWorkflow(id);
      deleteConfirm = null;
      await loadWorkflows();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function nodeCount(workflow: any): number {
    if (!workflow?.nodes) return 0;
    return Object.keys(workflow.nodes).length;
  }

  function nodeRange(count: number): string {
    if (count === 0) return "empty";
    if (count < 5) return "small";
    if (count < 12) return "medium";
    return "large";
  }

  function workflowHref(id: string): string {
    return nullboilerUiRoutes.workflow(id);
  }

  function workflowId(record: EntityRecord): string {
    return String(record.fields?.id || record.id.replace(/^workflow:/, ""));
  }
</script>

<div class="page">
  <div class="topbar">
    <BoilerInstanceSelector onChange={() => { error = null; void loadWorkflows(); }} />
    <a href={nullboilerUiRoutes.newWorkflow()} class="primary-link">New Workflow</a>
  </div>

  <UniversalEntityView
    title="Workflows"
    description="Reusable automation definitions from the selected NullBoiler instance."
    records={workflowRecords}
    columns={workflowColumns}
    views={workflowViews}
    defaultViewId="cards"
    {loading}
    {error}
    actions={workflowActions}
    emptyTitle="No workflows"
    emptyDescription="Create a workflow to populate this collection."
    onRefresh={loadWorkflows}
  />
</div>

<style>
  .page {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
  }

  .topbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .primary-link {
    display: inline-flex;
    min-height: 2.25rem;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    padding: 0 0.875rem;
    background: var(--shadcn-primary);
    color: var(--shadcn-primary-foreground);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
  }

  .primary-link:hover,
  .primary-link:focus-visible {
    opacity: 0.92;
  }
</style>
