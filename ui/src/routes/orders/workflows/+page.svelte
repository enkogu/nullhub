<script lang="ts">
  import { onMount } from "svelte";
  import { nullBoilerApi } from "$lib/api/client";
  import { isCircuitBreakerError } from "$lib/components/DataState.svelte";
  import { nullboilerUiRoutes } from "$lib/nullboiler/routes";
  import BoilerInstanceSelector from "$lib/components/nullboiler/BoilerInstanceSelector.svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";

  let workflows = $state<any[]>([]);
  let loading = $state(true);
  let error = $state<unknown>(null);
  let offline = $state(false);
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

  function isOfflineError(message: string): boolean {
    const text = (message || "").toLowerCase();
    return (
      text.includes("unreachable") ||
      text.includes("offline") ||
      text.includes("econnrefused") ||
      text.includes("connection refused") ||
      text.includes("failed to fetch") ||
      text.includes("networkerror") ||
      text.includes("network error") ||
      /\b5\d\d\b/.test(text)
    );
  }

  function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "";
  }

  async function loadWorkflows() {
    loading = true;
    try {
      workflows = (await nullBoilerApi.listWorkflows()) || [];
      error = null;
      offline = false;
    } catch (e) {
      const message = errorMessage(e);
      if (isCircuitBreakerError(e)) {
        offline = false;
        error = e;
      } else if (isOfflineError(message)) {
        offline = true;
        error = null;
        workflows = [];
      } else {
        offline = false;
        error = e || message;
      }
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
      error = e;
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
  <UniversalEntityView
    title="Workflows"
    description="Reusable automation definitions from the selected NullBoiler instance."
    records={workflowRecords}
    columns={workflowColumns}
    views={workflowViews}
    defaultViewId="cards"
    {loading}
    error={offline ? null : error}
    actions={workflowActions}
    emptyTitle={offline ? "NullBoiler is offline" : "No workflows"}
    emptyDescription={offline
      ? "Start the NullBoiler instance to load workflows."
      : "Create a workflow to populate this collection."}
    onRefresh={loadWorkflows}
  >
    {#snippet headerControls()}
      <BoilerInstanceSelector onChange={() => { error = null; offline = false; void loadWorkflows(); }} />
    {/snippet}
    {#snippet headerActions()}
      <Button size="sm" href={nullboilerUiRoutes.newWorkflow()}>+ New workflow</Button>
    {/snippet}
  </UniversalEntityView>
</div>

<style>
  .page {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
  }
</style>
