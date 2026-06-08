<script lang="ts">
  import { api } from "$lib/api/client";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";
  import { PageHeader } from "$lib/components/ui/page-header";
  import { Dialog } from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Select } from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
  import { Badge } from "$lib/components/ui/badge";

  type Pipeline = {
    id?: string;
    name?: string;
    definition?: any;
    created_at_ms?: number;
  };

  type Task = {
    id?: string;
    pipeline_id?: string;
    stage?: string;
    title?: string;
    description?: string;
    priority?: number;
    metadata?: any;
    task_version?: number;
    created_at_ms?: number;
    updated_at_ms?: number;
    dependencies?: any[];
    assignments?: any[];
    available_transitions?: any[];
    latest_run?: any;
  };

  type Run = {
    id?: string;
    task_id?: string;
    attempt?: number;
    status?: string;
    agent_id?: string | null;
    agent_role?: string | null;
    started_at_ms?: number | null;
    ended_at_ms?: number | null;
  };

  type RunEvent = {
    id?: number;
    run_id?: string;
    ts_ms?: number;
    kind?: string;
    data?: any;
  };

  type Artifact = {
    id?: string;
    task_id?: string | null;
    run_id?: string | null;
    created_at_ms?: number;
    kind?: string;
    uri?: string;
    sha256?: string | null;
    size_bytes?: number | null;
    meta?: any;
  };

  type QueueRole = {
    role?: string;
    claimable_count?: number;
    failed_count?: number;
    stuck_count?: number;
    near_expiry_leases?: number;
    oldest_claimable_age_ms?: number | null;
  };

  type PanelView = "tasks" | "pipelines" | "queue" | "runs" | "artifacts";
  type ArtifactScope = "selected" | "custom" | "all";
  type WorkMode = "tasks" | "planner" | "dependencies";
  type PlanningGroup = {
    id: string;
    name: string;
    tasks: Task[];
    stages: { stage: string; count: number }[];
    maxPriority: number;
  };
  type DependencyEdge = {
    task: Task;
    dependsOnId: string;
    dependsOnTitle: string;
    satisfied: boolean;
  };

  const allPanelViews: PanelView[] = ["tasks", "pipelines", "queue", "runs", "artifacts"];
  const TASK_DETAIL_PREFETCH_LIMIT = 12;
  const panelViewLabels: Record<PanelView, string> = {
    tasks: "Tasks",
    pipelines: "Processes",
    queue: "Queue",
    runs: "Runs",
    artifacts: "Artifacts",
  };

  let {
    component,
    name,
    active = false,
    running = false,
    initialView = "tasks",
    initialArtifactScope = "selected",
    views = allPanelViews,
    workMode = "tasks",
    title = "NullTickets",
    subtitle = "",
  } = $props<{
    component: string;
    name: string;
    active?: boolean;
    running?: boolean;
    initialView?: PanelView;
    initialArtifactScope?: ArtifactScope;
    views?: PanelView[];
    workMode?: WorkMode;
    title?: string;
    subtitle?: string;
  }>();

  const defaultPipelineDefinition = JSON.stringify(
    {
      initial: "todo",
      states: {
        todo: {
          agent_role: "coder",
          description: "Ready",
        },
        done: {
          terminal: true,
        },
      },
      transitions: [
        {
          from: "todo",
          to: "done",
          trigger: "complete",
        },
      ],
    },
    null,
    2,
  );

  let panelView = $state<PanelView>("tasks");
  let panelViewConfigKey = $state("");
  let loadKey = $state("");
  let loading = $state(false);
  let actionLoading = $state(false);
  let error = $state("");
  let message = $state("");

  let pipelines = $state<Pipeline[]>([]);
  let selectedPipelineId = $state("");
  let createPipelineName = $state("");
  let createPipelineDefinition = $state(defaultPipelineDefinition);

  let tasks = $state<Task[]>([]);
  let nextCursor = $state<string | null>(null);
  let filterPipeline = $state("");
  let filterStage = $state("");
  let taskLimit = $state("25");
  let selectedTaskId = $state("");
  let selectedTask = $state<Task | null>(null);
  let selectedTaskLoading = $state(false);
  let taskDetailsById = $state<Record<string, Task>>({});
  let taskDetailsLoadKey = $state("");
  let taskDetailsLoadToken = 0;
  let dependencyLoading = $state(false);

  let createTaskPipeline = $state("");
  let createTaskTitle = $state("");
  let createTaskDescription = $state("");
  let createTaskPriority = $state("0");
  let createTaskMetadata = $state("{}");
  let createTaskDependencies = $state("");
  let createTaskAssignedAgent = $state("");
  let bulkTasksJson = $state("[\n]");

  let assignAgent = $state("");
  let dependencyTaskId = $state("");

  let queueRoles = $state<QueueRole[]>([]);
  let claimAgent = $state("nullhub");
  let claimRole = $state("coder");
  let claimTtl = $state("300000");
  let claimed = $state<any>(null);

  let selectedRunId = $state("");
  let runEvents = $state<RunEvent[]>([]);
  let runEventsCursor = $state<string | null>(null);
  let runEventsLimit = $state("50");
  let runLeaseId = $state("");
  let runLeaseToken = $state("");
  let leaseRunId = $state("");
  let heartbeatExpiresAt = $state<number | null>(null);
  let eventKind = $state("note");
  let eventData = $state("{}");
  let transitionTrigger = $state("");
  let transitionInstructions = $state("");
  let transitionUsage = $state("{}");
  let failReason = $state("");
  let failUsage = $state("{}");

  let artifacts = $state<Artifact[]>([]);
  let artifactsCursor = $state<string | null>(null);
  let artifactsScopeKey = $state("");
  let artifactLoadKey = $state("");
  let artifactLimit = $state("25");
  let artifactScope = $state<ArtifactScope>("selected");
  let artifactTaskFilter = $state("");
  let artifactRunFilter = $state("");
  let artifactKind = $state("file");
  let artifactUri = $state("");
  let artifactSha256 = $state("");
  let artifactSize = $state("");
  let artifactMeta = $state("{}");

  let showCreateProcess = $state(false);
  let showCreateTask = $state(false);
  let showCreateArtifact = $state(false);

  const selectedPipeline = $derived(
    pipelines.find((pipeline) => pipelineId(pipeline) === selectedPipelineId) || null,
  );
  const activeTaskAssignments = $derived(
    Array.isArray(selectedTask?.assignments)
      ? selectedTask.assignments.filter((assignment: any) => assignment?.active !== false)
      : [],
  );
  const taskDependencies = $derived(
    Array.isArray(selectedTask?.dependencies) ? selectedTask.dependencies : [],
  );
  const taskTransitions = $derived(
    Array.isArray(selectedTask?.available_transitions) ? selectedTask.available_transitions : [],
  );
  const selectedRun = $derived<Run | null>(
    selectedTask?.latest_run && (!selectedRunId || selectedTask.latest_run.id === selectedRunId)
      ? selectedTask.latest_run
      : selectedRunId
        ? { id: selectedRunId, task_id: selectedTaskId }
        : null,
  );
  const visiblePanelViews = $derived(
    (views.length ? views : allPanelViews).filter(
      (view, index, list) => allPanelViews.includes(view) && list.indexOf(view) === index,
    ),
  );
  const panelViewSubtitles: Record<PanelView, string> = {
    tasks: "Browse and manage tasks for this backend.",
    pipelines: "Process definitions and their state machines.",
    queue: "Role-level dispatch capacity and failure counters.",
    runs: "Drive the active run and inspect its event stream.",
    artifacts: "Artifacts linked to tasks and runs.",
  };
  const headerSubtitle = $derived(
    subtitle ||
      (workMode === "planner"
        ? "Plan tasks by process and priority."
        : workMode === "dependencies"
          ? "Inspect task dependencies and blockers."
          : panelViewSubtitles[panelView]) ||
      "",
  );
  const taskColumns: EntityColumn[] = [
    { id: "stage", label: "Stage", type: "status", width: "minmax(120px,.42fr)" },
    { id: "process", label: "Process", type: "select", width: "minmax(170px,.62fr)" },
    { id: "priority", label: "Priority", type: "number", width: "minmax(96px,.28fr)" },
    { id: "assignments", label: "Assignments", type: "tags", width: "minmax(170px,.72fr)" },
    { id: "dependencies", label: "Deps", type: "number", width: "minmax(86px,.24fr)" },
    { id: "updated", label: "Updated", type: "date", width: "minmax(150px,.52fr)" },
  ];
  const taskViews = createViewSet({
    kanban: { groupBy: "stage" },
    tree: { parentField: "process" },
    timeline: { dateField: "updated" },
    calendar: { dateField: "updated" },
  });
  const taskActions: EntityViewAction[] = [
    { id: "select", label: "Select", variant: "default", run: (record) => selectTask(taskRecordId(record)) },
    {
      id: "run-controls",
      label: "Run",
      visible: (record) => canShowPanelView("runs") && Boolean(record.fields?.run_id),
      run: async (record) => {
        await selectTask(taskRecordId(record));
        setPanelView("runs");
      },
    },
    {
      id: "artifacts",
      label: "Artifacts",
      visible: () => canShowPanelView("artifacts"),
      run: async (record) => {
        await selectTask(taskRecordId(record));
        openSelectedArtifacts();
      },
    },
  ];
  const taskRecords = $derived(
    tasks.map((task) => {
      const detail = taskDetail(task) || task;
      const id = taskId(task);
      const assignments = Array.isArray(detail.assignments)
        ? detail.assignments
            .filter((assignment: any) => assignment?.active !== false)
            .map((assignment: any) => String(assignment.agent_id || ""))
            .filter(Boolean)
        : [];
      const dependencies = taskDependencyList(task);
      const latestRun = detail.latest_run;
      return {
        id: `task:${id}`,
        title: taskTitle(task),
        type: "task",
        status: taskStage(task),
        subtitle: processNameById(task.pipeline_id),
        description: task.description || "",
        parentId: String(task.pipeline_id || ""),
        date: msIso(task.updated_at_ms || task.created_at_ms),
        fields: {
          task_id: id,
          stage: taskStage(task),
          process: processNameById(task.pipeline_id),
          process_id: String(task.pipeline_id || ""),
          priority: taskPriority(task),
          assignments,
          dependencies: dependencies.length,
          run_id: runId(latestRun),
          run_status: latestRun?.status || "",
          updated: msIso(task.updated_at_ms || task.created_at_ms),
        },
        raw: task,
      };
    }) satisfies EntityRecord[],
  );
  const pipelineColumns: EntityColumn[] = [
    { id: "id", label: "ID", type: "mono", width: "minmax(180px,.8fr)" },
    { id: "states", label: "States", type: "number", width: "minmax(96px,.3fr)" },
    { id: "created", label: "Created", type: "date", width: "minmax(150px,.5fr)" },
  ];
  const pipelineViews = createViewSet({
    kanban: { groupBy: "state_range" },
    tree: { parentField: "state_range" },
    timeline: { dateField: "created" },
    calendar: { dateField: "created" },
  });
  const pipelineActions: EntityViewAction[] = [
    { id: "select", label: "Select", variant: "default", run: (record) => (selectedPipelineId = pipelineRecordId(record)) },
  ];
  const pipelineRecords = $derived(
    pipelines.map((pipeline) => {
      const id = pipelineId(pipeline);
      const states = pipelineStateCount(pipeline);
      return {
        id: `process:${id}`,
        title: pipelineName(pipeline),
        type: "process",
        subtitle: id,
        description: `${states} states`,
        date: msIso(pipeline.created_at_ms),
        fields: {
          id,
          states,
          state_range: stateRange(states),
          created: msIso(pipeline.created_at_ms),
        },
        raw: pipeline,
      };
    }) satisfies EntityRecord[],
  );
  const queueColumns: EntityColumn[] = [
    { id: "claimable", label: "Claimable", type: "number", width: "minmax(110px,.35fr)" },
    { id: "failed", label: "Failed", type: "number", width: "minmax(96px,.3fr)" },
    { id: "stuck", label: "Stuck", type: "number", width: "minmax(96px,.3fr)" },
    { id: "oldest", label: "Oldest", type: "mono", width: "minmax(120px,.4fr)" },
  ];
  const queueViews = createViewSet({
    kanban: { groupBy: "status" },
    tree: { parentField: "status" },
  });
  const queueActions: EntityViewAction[] = [
    { id: "use-role", label: "Use Role", variant: "default", run: (record) => (claimRole = String(record.fields?.role || "coder")) },
  ];
  const queueRecords = $derived(
    queueRoles.map((role) => {
      const name = String(role.role || "coder");
      const failed = Number(role.failed_count || 0);
      const stuck = Number(role.stuck_count || 0);
      const claimable = Number(role.claimable_count || 0);
      return {
        id: `queue:${name}`,
        title: name,
        type: "queue role",
        status: failed > 0 || stuck > 0 ? "attention" : claimable > 0 ? "claimable" : "idle",
        description: `${claimable} claimable`,
        fields: {
          role: name,
          status: failed > 0 || stuck > 0 ? "attention" : claimable > 0 ? "claimable" : "idle",
          claimable,
          failed,
          stuck,
          oldest: formatDuration(role.oldest_claimable_age_ms),
        },
        raw: role,
      };
    }) satisfies EntityRecord[],
  );
  const eventColumns: EntityColumn[] = [
    { id: "kind", label: "Kind", type: "select", width: "minmax(130px,.45fr)" },
    { id: "time", label: "Time", type: "date", width: "minmax(150px,.52fr)" },
    { id: "preview", label: "Preview", type: "text", width: "minmax(260px,1.2fr)" },
    { id: "payload", label: "Payload", type: "mono", width: "minmax(360px,1.6fr)", cardHidden: true, sortable: false },
  ];
  const eventViews = createViewSet({
    kanban: { groupBy: "kind" },
    tree: { parentField: "kind" },
    timeline: { dateField: "time" },
    calendar: { dateField: "time" },
  });
  const eventRecords = $derived(
    runEvents.map((event) => {
      const payload = jsonPreview(event.data);
      return {
        id: `event:${event.id ?? event.ts_ms ?? Math.random()}`,
        title: event.kind || "event",
        type: "run event",
        subtitle: `#${event.id ?? "-"}`,
        description: shortPreview(event.data),
        date: msIso(event.ts_ms),
        fields: {
          kind: event.kind || "event",
          time: msIso(event.ts_ms),
          preview: shortPreview(event.data),
          payload,
        },
        raw: event,
      };
    }) satisfies EntityRecord[],
  );
  const artifactColumns: EntityColumn[] = [
    { id: "kind", label: "Kind", type: "select", width: "minmax(110px,.35fr)" },
    { id: "task", label: "Task", type: "mono", width: "minmax(150px,.55fr)" },
    { id: "run", label: "Run", type: "mono", width: "minmax(150px,.55fr)" },
    { id: "size", label: "Size", type: "number", width: "minmax(100px,.32fr)" },
    { id: "created", label: "Created", type: "date", width: "minmax(150px,.52fr)" },
  ];
  const artifactViews = createViewSet({
    kanban: { groupBy: "kind" },
    tree: { parentField: "task" },
    timeline: { dateField: "created" },
    calendar: { dateField: "created" },
  });
  const artifactRecords = $derived(
    artifacts.map((artifact) => ({
      id: `artifact:${artifact.id || artifact.uri || artifact.created_at_ms}`,
      title: artifact.uri || artifact.id || "artifact",
      type: "artifact",
      subtitle: artifact.kind || "artifact",
      description: `task ${artifact.task_id || "-"} / run ${artifact.run_id || "-"}`,
      date: msIso(artifact.created_at_ms),
      fields: {
        kind: artifact.kind || "artifact",
        task: artifact.task_id || "-",
        run: artifact.run_id || "-",
        size: artifact.size_bytes || 0,
        created: msIso(artifact.created_at_ms),
        meta: shortPreview(artifact.meta),
      },
      raw: artifact,
    })) satisfies EntityRecord[],
  );

  function fallbackPanelView(): PanelView {
    return visiblePanelViews[0] || (allPanelViews.includes(initialView) ? initialView : "tasks");
  }

  function canShowPanelView(view: PanelView): boolean {
    return visiblePanelViews.includes(view);
  }

  function shouldLoadVisibleTaskDetails(): boolean {
    return panelView === "tasks" || workMode === "planner" || workMode === "dependencies";
  }

  function setPanelView(view: PanelView) {
    const nextView = canShowPanelView(view) ? view : fallbackPanelView();
    if (panelView === nextView) return;
    panelView = nextView;
    if (active && running) {
      setTimeout(() => void refreshAll(), 0);
    }
  }

  function pipelineId(pipeline: Pipeline | null | undefined): string {
    return String(pipeline?.id || pipeline?.name || "");
  }

  function pipelineName(pipeline: Pipeline | null | undefined): string {
    return String(pipeline?.name || pipeline?.id || "pipeline");
  }

  function processNameById(id: string | null | undefined): string {
    const value = String(id || "");
    if (!value) return "-";
    const pipeline = pipelines.find((item) => pipelineId(item) === value);
    return pipeline ? pipelineName(pipeline) : value;
  }

  function taskId(task: Task | null | undefined): string {
    return String(task?.id || "");
  }

  function taskTitle(task: Task | null | undefined): string {
    return String(task?.title || task?.id || "task");
  }

  function taskPriority(task: Task | null | undefined): number {
    const value = Number(task?.priority ?? 0);
    return Number.isFinite(value) ? value : 0;
  }

  function taskStage(task: Task | null | undefined): string {
    return String(task?.stage || "unassigned");
  }

  function taskCreatedAt(task: Task | null | undefined): number {
    const value = Number(task?.created_at_ms ?? 0);
    return Number.isFinite(value) ? value : 0;
  }

  function taskDetail(task: Task | null | undefined): Task | null {
    if (!task) return null;
    const id = taskId(task);
    if (id && taskDetailsById[id]) return taskDetailsById[id];
    if (id && selectedTaskId === id && selectedTask) return selectedTask;
    return task;
  }

  function dependencyTargetId(dep: any): string {
    if (!dep) return "";
    if (typeof dep === "string") return dep;
    return String(dep.depends_on_task_id || dep.task_id || dep.id || "");
  }

  function taskDependencyList(task: Task | null | undefined): any[] {
    const detail = taskDetail(task);
    return Array.isArray(detail?.dependencies) ? detail.dependencies : [];
  }

  function taskById(id: string): Task | null {
    if (!id) return null;
    return tasks.find((task) => taskId(task) === id) || null;
  }

  function dependencyTargetTitle(dep: any): string {
    const id = dependencyTargetId(dep);
    const target = taskById(id);
    return target ? taskTitle(target) : id || "-";
  }

  function sortedPlanningTasks(): Task[] {
    return [...tasks].sort((a, b) => {
      const priorityDiff = taskPriority(b) - taskPriority(a);
      if (priorityDiff !== 0) return priorityDiff;
      return taskCreatedAt(a) - taskCreatedAt(b);
    });
  }

  function stageSummary(items: Task[]): { stage: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const task of items) {
      const stage = taskStage(task);
      counts.set(stage, (counts.get(stage) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));
  }

  function planningGroups(): PlanningGroup[] {
    const groups = new Map<string, PlanningGroup>();
    for (const task of sortedPlanningTasks()) {
      const id = String(task.pipeline_id || "unassigned");
      const existing = groups.get(id);
      if (existing) {
        existing.tasks.push(task);
        existing.maxPriority = Math.max(existing.maxPriority, taskPriority(task));
      } else {
        groups.set(id, {
          id,
          name: processNameById(id),
          tasks: [task],
          stages: [],
          maxPriority: taskPriority(task),
        });
      }
    }
    return [...groups.values()]
      .map((group) => ({ ...group, stages: stageSummary(group.tasks) }))
      .sort((a, b) => b.maxPriority - a.maxPriority || b.tasks.length - a.tasks.length || a.name.localeCompare(b.name));
  }

  function visibleProcessCount(): number {
    return new Set(tasks.map((task) => String(task.pipeline_id || "unassigned"))).size;
  }

  function visibleStageCount(): number {
    return new Set(tasks.map((task) => taskStage(task))).size;
  }

  function highestPriorityTask(): Task | null {
    return sortedPlanningTasks()[0] || null;
  }

  function dependencyEdges(): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    for (const task of tasks) {
      for (const dep of taskDependencyList(task)) {
        const dependsOnId = dependencyTargetId(dep);
        if (!dependsOnId) continue;
        edges.push({
          task,
          dependsOnId,
          dependsOnTitle: dependencyTargetTitle(dep),
          satisfied: Boolean(taskById(dependsOnId)),
        });
      }
    }
    return edges;
  }

  function selectedDependencyEdges(): DependencyEdge[] {
    if (!selectedTask) return [];
    return taskDependencyList(selectedTask)
      .map((dep) => {
        const dependsOnId = dependencyTargetId(dep);
        return {
          task: selectedTask,
          dependsOnId,
          dependsOnTitle: dependencyTargetTitle(dep),
          satisfied: Boolean(taskById(dependsOnId)),
        };
      })
      .filter((edge) => edge.dependsOnId);
  }

  function tasksBlockingSelected(): Task[] {
    if (!selectedTaskId) return [];
    return tasks.filter((task) =>
      taskDependencyList(task).some((dep) => dependencyTargetId(dep) === selectedTaskId),
    );
  }

  function blockedTaskCount(): number {
    return tasks.filter((task) => taskDependencyList(task).length > 0).length;
  }

  function readyTaskCount(): number {
    return tasks.filter((task) => taskDependencyList(task).length === 0).length;
  }

  function runId(run: Run | null | undefined): string {
    return String(run?.id || "");
  }

  function normalizeList(result: any): any[] {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result?.items)) return result.items;
    if (Array.isArray(result?.tasks)) return result.tasks;
    if (Array.isArray(result?.pipelines)) return result.pipelines;
    return [];
  }

  function formatTime(ms: number | undefined | null): string {
    if (!ms) return "-";
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return "-";
    }
  }

  function msIso(ms: number | undefined | null): string {
    if (!ms) return "";
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
  }

  function formatDuration(ms: number | undefined | null): string {
    if (ms == null) return "-";
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function jsonPreview(value: any): string {
    if (value === null || value === undefined) return "{}";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function shortPreview(value: any): string {
    const text = jsonPreview(value).replace(/\s+/g, " ").trim();
    return text.length > 140 ? `${text.slice(0, 140)}...` : text || "-";
  }

  function taskRecordId(record: EntityRecord): string {
    return String(record.fields?.task_id || record.id.replace(/^task:/, ""));
  }

  function pipelineRecordId(record: EntityRecord): string {
    return String(record.fields?.id || record.id.replace(/^process:/, ""));
  }

  function pipelineStateCount(pipeline: Pipeline | null | undefined): number {
    const states = pipeline?.definition?.states;
    return states && typeof states === "object" ? Object.keys(states).length : 0;
  }

  function pipelineStateList(
    pipeline: Pipeline | null | undefined,
  ): { name: string; agentRole: string; description: string; terminal: boolean; initial: boolean }[] {
    const definition = pipeline?.definition;
    const states = definition?.states;
    if (!states || typeof states !== "object") return [];
    const initial = String(definition?.initial || "");
    return Object.entries(states).map(([name, value]) => {
      const state = (value || {}) as Record<string, any>;
      return {
        name,
        agentRole: String(state.agent_role || ""),
        description: String(state.description || ""),
        terminal: Boolean(state.terminal),
        initial: name === initial,
      };
    });
  }

  function queueBadgeVariant(status: string): "warning" | "success" | "muted" {
    if (status === "attention") return "warning";
    if (status === "claimable") return "success";
    return "muted";
  }

  function runBadgeVariant(status: string | null | undefined): "success" | "warning" | "destructive" | "muted" {
    const value = String(status || "").toLowerCase();
    if (value === "succeeded" || value === "success" || value === "completed" || value === "done") return "success";
    if (value === "failed" || value === "error") return "destructive";
    if (value === "running" || value === "in_progress" || value === "active") return "warning";
    return "muted";
  }

  function stateRange(count: number): string {
    if (count === 0) return "empty";
    if (count < 4) return "small";
    if (count < 10) return "medium";
    return "large";
  }

  function parseJsonField(raw: string, fallback: any): any {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    return JSON.parse(trimmed);
  }

  function boundedInt(raw: string, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(raw || String(fallback), 10);
    const value = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(min, Math.min(max, value));
  }

  function firstClaimableRole(): string {
    const role =
      queueRoles.find((item) => Number(item?.claimable_count || 0) > 0)?.role ||
      queueRoles[0]?.role;
    return typeof role === "string" && role.length > 0 ? role : "coder";
  }

  function clearRunContext(clearLease = true) {
    selectedRunId = "";
    runEvents = [];
    runEventsCursor = null;
    if (clearLease) {
      runLeaseId = "";
      runLeaseToken = "";
      leaseRunId = "";
      heartbeatExpiresAt = null;
    }
  }

  function artifactScopeParams(): { taskId?: string; runId?: string } {
    if (artifactScope === "all") return {};
    if (artifactScope === "custom") {
      return {
        taskId: artifactTaskFilter.trim() || undefined,
        runId: artifactRunFilter.trim() || undefined,
      };
    }
    return {
      taskId: selectedTaskId || undefined,
      runId: selectedRunId || undefined,
    };
  }

  function artifactScopeLabel(): string {
    const scope = artifactScopeParams();
    if (scope.taskId && scope.runId) return `task ${scope.taskId} / run ${scope.runId}`;
    if (scope.taskId) return `task ${scope.taskId}`;
    if (scope.runId) return `run ${scope.runId}`;
    return "unlinked";
  }

  function artifactScopeCacheKey(scope: { taskId?: string; runId?: string }): string {
    return `${artifactScope}:${scope.taskId || ""}:${scope.runId || ""}`;
  }

  function setArtifactScope(scope: ArtifactScope) {
    artifactScope = scope;
    artifactsCursor = null;
    artifactsScopeKey = "";
    artifactLoadKey = "";
  }

  function openSelectedArtifacts() {
    artifactScope = "selected";
    artifactLoadKey = "";
    setPanelView("artifacts");
  }

  function syncLeaseToSelectedRun() {
    if (leaseRunId && selectedRunId && leaseRunId === selectedRunId) return;
    runLeaseId = "";
    runLeaseToken = "";
    leaseRunId = "";
    heartbeatExpiresAt = null;
  }

  async function refreshAll() {
    if (component !== "nulltickets" || !running) return;
    loading = true;
    error = "";
    try {
      const needsPipelines = panelView === "tasks" || panelView === "pipelines";
      const needsTasks = panelView === "tasks" || panelView === "runs" || (panelView === "artifacts" && artifactScope === "selected");
      const needsQueue = panelView === "queue";

      const [pipelineResult, queueResult] = await Promise.all([
        needsPipelines ? api.nullTicketsPipelines(component, name) : Promise.resolve(null),
        needsQueue ? api.nullTicketsAction(component, name, { method: "GET", path: "/ops/queue" }) : Promise.resolve(null),
      ]);

      if (pipelineResult) {
        pipelines = normalizeList(pipelineResult);
        if (!selectedPipelineId || !pipelines.some((pipeline) => pipelineId(pipeline) === selectedPipelineId)) {
          selectedPipelineId = pipelineId(pipelines[0] || {});
        }
        if (!createTaskPipeline && selectedPipelineId) createTaskPipeline = selectedPipelineId;
      }
      if (queueResult) {
        queueRoles = normalizeList(queueResult?.roles ? { items: queueResult.roles } : queueResult);
        if (!claimRole) claimRole = firstClaimableRole();
      }

      if (needsTasks) {
        await loadTasks(false);
      } else if (panelView === "artifacts") {
        await loadArtifacts(false);
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function loadVisibleTaskDetails(items = tasks, force = false) {
    if (component !== "nulltickets" || !running || !shouldLoadVisibleTaskDetails()) return;
    const allIds = items.map((task) => taskId(task)).filter(Boolean);
    if (allIds.length === 0) {
      taskDetailsLoadToken += 1;
      taskDetailsById = {};
      taskDetailsLoadKey = "";
      return;
    }
    const ids = [
      ...(selectedTaskId && allIds.includes(selectedTaskId) ? [selectedTaskId] : []),
      ...allIds.filter((id) => id !== selectedTaskId),
    ].slice(0, TASK_DETAIL_PREFETCH_LIMIT);
    const nextKey = ids.join("|");
    if (!force && taskDetailsLoadKey === nextKey) return;
    const loadToken = taskDetailsLoadToken + 1;
    taskDetailsLoadToken = loadToken;
    taskDetailsLoadKey = nextKey;
    dependencyLoading = true;
    try {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const detail = await api.nullTicketsGetTask(component, name, id);
            return [id, detail] as const;
          } catch {
            return [id, items.find((task) => taskId(task) === id) || null] as const;
          }
        }),
      );
      if (loadToken !== taskDetailsLoadToken) return;
      const nextDetails: Record<string, Task> = {};
      for (const [id, detail] of entries) {
        if (detail) nextDetails[id] = detail;
      }
      taskDetailsById = nextDetails;
    } finally {
      if (loadToken === taskDetailsLoadToken) dependencyLoading = false;
    }
  }

  async function loadTasks(append: boolean) {
    if (component !== "nulltickets" || !running) return;
    const limit = boundedInt(taskLimit, 25, 1, 1000);
    loading = true;
    error = "";
    try {
      const result = await api.nullTicketsTasks(component, name, {
        pipelineId: filterPipeline || undefined,
        stage: filterStage || undefined,
        limit,
        cursor: append ? nextCursor || undefined : undefined,
      });
      const items = normalizeList(result);
      const nextTasks = append ? [...tasks, ...items] : items;
      tasks = nextTasks;
      nextCursor = typeof result?.next_cursor === "string" ? result.next_cursor : null;
      void loadVisibleTaskDetails(nextTasks, !append);
      if (append) return;

      const selectedStillVisible = selectedTaskId && items.some((task) => taskId(task) === selectedTaskId);
      const nextSelectedTaskId = selectedStillVisible
        ? selectedTaskId
        : items.length > 0
          ? taskId(items[0])
          : "";
      if (nextSelectedTaskId) {
        selectedTaskId = nextSelectedTaskId;
        selectedTask =
          taskDetailsById[nextSelectedTaskId] ||
          items.find((task) => taskId(task) === nextSelectedTaskId) ||
          null;
        void selectTask(nextSelectedTaskId);
      } else {
        selectedTaskId = "";
        selectedTask = null;
        clearRunContext();
        artifacts = [];
        artifactsCursor = null;
        artifactsScopeKey = "";
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function selectTask(id: string) {
    if (!id || component !== "nulltickets" || !running) return;
    selectedTaskId = id;
    selectedTaskLoading = true;
    error = "";
    try {
      const task = await api.nullTicketsGetTask(component, name, id);
      selectedTask = task;
      taskDetailsById = { ...taskDetailsById, [id]: task };
      await loadSelectedTaskContext();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      selectedTaskLoading = false;
    }
  }

  async function loadSelectedTaskContext() {
    const task = selectedTask;
    if (!task) {
      selectedRunId = "";
      runEvents = [];
      artifacts = [];
      artifactsCursor = null;
      artifactsScopeKey = "";
      syncLeaseToSelectedRun();
      return;
    }

    const latestRunId = runId(task.latest_run);
    if (latestRunId) {
      selectedRunId = latestRunId;
    } else {
      try {
        const runState = await api.nullTicketsGetRunState(component, name, taskId(task));
        selectedRunId = String(runState?.run_id || "");
      } catch {
        selectedRunId = "";
      }
    }
    syncLeaseToSelectedRun();

    if (selectedRunId) {
      await loadRunEvents(false);
    } else {
      runEvents = [];
      runEventsCursor = null;
    }
    await loadArtifacts(false);
  }

  async function createPipeline() {
    const nameValue = createPipelineName.trim();
    if (!nameValue || component !== "nulltickets" || !running) return;
    actionLoading = true;
    error = "";
    message = "";
    try {
      const definition = parseJsonField(createPipelineDefinition, {});
      const result = await api.nullTicketsCreatePipeline(component, name, {
        name: nameValue,
        definition,
      });
      createPipelineName = "";
      createPipelineDefinition = defaultPipelineDefinition;
      message = `Process ${result?.id || nameValue} created`;
      await refreshAll();
      selectedPipelineId = result?.id || result?.name || nameValue || selectedPipelineId;
      filterPipeline = selectedPipelineId;
      createTaskPipeline = selectedPipelineId;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = false;
    }
  }

  async function createTask() {
    const pipelineIdValue = createTaskPipeline.trim() || filterPipeline.trim() || selectedPipelineId.trim();
    const title = createTaskTitle.trim();
    if (!pipelineIdValue || !title || component !== "nulltickets" || !running) return;
    actionLoading = true;
    error = "";
    message = "";
    try {
      const priority = Number.parseInt(createTaskPriority || "0", 10);
      const dependencies = createTaskDependencies
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const payload: Record<string, any> = {
        pipeline_id: pipelineIdValue,
        title,
        description: createTaskDescription.trim(),
        priority: Number.isFinite(priority) ? priority : 0,
        metadata: parseJsonField(createTaskMetadata, {}),
      };
      if (dependencies.length > 0) payload.dependencies = dependencies;
      if (createTaskAssignedAgent.trim()) {
        payload.assigned_agent_id = createTaskAssignedAgent.trim();
        payload.assigned_by = "nullhub";
      }
      const result = await api.nullTicketsCreateTask(component, name, payload);
      createTaskTitle = "";
      createTaskDescription = "";
      createTaskDependencies = "";
      createTaskAssignedAgent = "";
      message = `Task ${result?.id || ""} created`.trim();
      await loadTasks(false);
      if (result?.id) await selectTask(result.id);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = false;
    }
  }

  async function bulkCreateTasks() {
    if (component !== "nulltickets" || !running) return;
    actionLoading = true;
    error = "";
    message = "";
    try {
      const parsed = parseJsonField(bulkTasksJson, []);
      const tasksToCreate = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tasks) ? parsed.tasks : [];
      if (tasksToCreate.length === 0) {
        throw new Error("Bulk JSON must be an array or { tasks: [...] }");
      }
      const result = await api.nullTicketsBulkCreateTasks(component, name, tasksToCreate);
      message = `Created ${(result?.ids || []).length || tasksToCreate.length} tasks`;
      bulkTasksJson = "[\n]";
      await loadTasks(false);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = false;
    }
  }

  async function assignTask() {
    if (!selectedTaskId || !assignAgent.trim() || component !== "nulltickets" || !running) return;
    actionLoading = true;
    error = "";
    message = "";
    try {
      await api.nullTicketsAssignTask(component, name, selectedTaskId, {
        agent_id: assignAgent.trim(),
        assigned_by: "nullhub",
      });
      message = "Task assigned";
      assignAgent = "";
      await selectTask(selectedTaskId);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = false;
    }
  }

  async function unassignTask(agentId: string) {
    if (!selectedTaskId || !agentId || component !== "nulltickets" || !running) return;
    actionLoading = true;
    error = "";
    message = "";
    try {
      await api.nullTicketsUnassignTask(component, name, selectedTaskId, agentId);
      message = "Task unassigned";
      await selectTask(selectedTaskId);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = false;
    }
  }

  async function addDependency() {
    if (!selectedTaskId || !dependencyTaskId.trim() || component !== "nulltickets" || !running) return;
    actionLoading = true;
    error = "";
    message = "";
    try {
      await api.nullTicketsAddDependency(component, name, selectedTaskId, {
        depends_on_task_id: dependencyTaskId.trim(),
      });
      message = "Dependency added";
      dependencyTaskId = "";
      await selectTask(selectedTaskId);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = false;
    }
  }

  async function claimNext() {
    if (component !== "nulltickets" || !running) return;
    actionLoading = true;
    error = "";
    message = "";
    let claimedTaskId = "";
    try {
      const leaseTtl = boundedInt(claimTtl, 300000, 1000, Number.MAX_SAFE_INTEGER);
      const result = await api.nullTicketsClaimTask(component, name, {
        agent_id: claimAgent.trim() || "nullhub",
        agent_role: claimRole.trim() || "coder",
        lease_ttl_ms: leaseTtl,
      });
      if (result?.task) {
        claimed = result;
        claimedTaskId = String(result.task.id || "");
        if (claimedTaskId) selectedTaskId = claimedTaskId;
        selectedTask = result.task;
        runLeaseId = String(result.lease_id || "");
        runLeaseToken = String(result.lease_token || "");
        leaseRunId = String(result.run?.id || "");
        heartbeatExpiresAt = typeof result.expires_at_ms === "number" ? result.expires_at_ms : null;
        selectedRunId = leaseRunId;
        message = `Claimed ${result.task.id || "task"}`;
      } else {
        claimed = null;
        message = "No claimable task";
      }
      await refreshAll();
      if (claimedTaskId) await selectTask(claimedTaskId);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = false;
    }
  }

  async function heartbeatLease() {
    if (!runLeaseId.trim() || !runLeaseToken.trim() || component !== "nulltickets" || !running) return;
    actionLoading = true;
    error = "";
    message = "";
    try {
      const result = await api.nullTicketsHeartbeatLease(component, name, runLeaseId.trim(), runLeaseToken.trim());
      heartbeatExpiresAt = typeof result?.expires_at_ms === "number" ? result.expires_at_ms : null;
      message = "Lease heartbeat accepted";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = false;
    }
  }

  async function loadRunEvents(append: boolean) {
    if (!selectedRunId || component !== "nulltickets" || !running) return;
    const limit = boundedInt(runEventsLimit, 50, 1, 1000);
    loading = true;
    error = "";
    try {
      const result = await api.nullTicketsRunEvents(component, name, selectedRunId, {
        limit,
        cursor: append ? runEventsCursor || undefined : undefined,
      });
      const items = normalizeList(result);
      runEvents = append ? [...runEvents, ...items] : items;
      runEventsCursor = typeof result?.next_cursor === "string" ? result.next_cursor : null;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function addRunEvent() {
    if (!selectedRunId || !eventKind.trim() || !runLeaseToken.trim() || component !== "nulltickets" || !running) return;
    actionLoading = true;
    error = "";
    message = "";
    try {
      const result = await api.nullTicketsAddRunEvent(
        component,
        name,
        selectedRunId,
        {
          kind: eventKind.trim(),
          data: parseJsonField(eventData, {}),
        },
        runLeaseToken.trim(),
      );
      message = `Event ${result?.id || ""} added`.trim();
      eventData = "{}";
      await loadRunEvents(false);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = false;
    }
  }

  async function transitionRun(triggerOverride = "") {
    const trigger = (triggerOverride || transitionTrigger).trim();
    if (!selectedRunId || !trigger || !runLeaseToken.trim() || component !== "nulltickets" || !running) return;
    actionLoading = true;
    error = "";
    message = "";
    try {
      const payload: Record<string, any> = {
        trigger,
        expected_stage: selectedTask?.stage || undefined,
        expected_task_version: selectedTask?.task_version,
        usage: parseJsonField(transitionUsage, {}),
      };
      if (transitionInstructions.trim()) payload.instructions = transitionInstructions.trim();
      const result = await api.nullTicketsTransitionRun(component, name, selectedRunId, payload, runLeaseToken.trim());
      message = `Transitioned ${result?.previous_stage || ""} -> ${result?.new_stage || ""}`.trim();
      transitionTrigger = "";
      transitionInstructions = "";
      await selectTask(selectedTaskId);
      await loadRunEvents(false);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = false;
    }
  }

  async function failRun() {
    if (!selectedRunId || !failReason.trim() || !runLeaseToken.trim() || component !== "nulltickets" || !running) return;
    actionLoading = true;
    error = "";
    message = "";
    try {
      await api.nullTicketsFailRun(
        component,
        name,
        selectedRunId,
        {
          error: failReason.trim(),
          usage: parseJsonField(failUsage, {}),
        },
        runLeaseToken.trim(),
      );
      message = "Run marked failed";
      failReason = "";
      await selectTask(selectedTaskId);
      await loadRunEvents(false);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = false;
    }
  }

  async function loadArtifacts(append: boolean) {
    if (component !== "nulltickets" || !running) return;
    const limit = boundedInt(artifactLimit, 25, 1, 1000);
    const scope = artifactScopeParams();
    const scopeKey = artifactScopeCacheKey(scope);
    const shouldAppend = append && artifactsScopeKey === scopeKey;
    loading = true;
    error = "";
    try {
      const result = await api.nullTicketsArtifacts(component, name, {
        ...scope,
        limit,
        cursor: shouldAppend ? artifactsCursor || undefined : undefined,
      });
      const items = normalizeList(result);
      artifacts = shouldAppend ? [...artifacts, ...items] : items;
      artifactsCursor = typeof result?.next_cursor === "string" ? result.next_cursor : null;
      artifactsScopeKey = scopeKey;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  async function createArtifact() {
    if (!artifactKind.trim() || !artifactUri.trim() || component !== "nulltickets" || !running) return;
    actionLoading = true;
    error = "";
    message = "";
    try {
      const size = artifactSize.trim() ? Number.parseInt(artifactSize.trim(), 10) : null;
      const scope = artifactScopeParams();
      const payload: Record<string, any> = {
        task_id: scope.taskId || null,
        run_id: scope.runId || null,
        kind: artifactKind.trim(),
        uri: artifactUri.trim(),
        sha256: artifactSha256.trim() || null,
        size_bytes: Number.isFinite(size) ? size : null,
        meta: parseJsonField(artifactMeta, {}),
      };
      const result = await api.nullTicketsCreateArtifact(component, name, payload);
      message = `Artifact ${result?.id || ""} created`.trim();
      artifactUri = "";
      artifactSha256 = "";
      artifactSize = "";
      artifactMeta = "{}";
      await loadArtifacts(false);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      actionLoading = false;
    }
  }

  $effect(() => {
    const configKey = `${initialView}:${visiblePanelViews.join("|")}:${initialArtifactScope}:${workMode}`;
    if (panelViewConfigKey !== configKey) {
      panelViewConfigKey = configKey;
      panelView = canShowPanelView(initialView) ? initialView : fallbackPanelView();
      artifactScope = initialArtifactScope;
      artifactLoadKey = "";
      artifactsScopeKey = "";
      return;
    }
    if (!canShowPanelView(panelView)) {
      panelView = fallbackPanelView();
    }
  });

  $effect(() => {
    const key = `${component}/${name}/${active}/${running}`;
    if (!active || component !== "nulltickets") return;
    if (loadKey === key) return;
    loadKey = key;
    message = "";
    error = "";
    selectedTask = null;
    selectedTaskId = "";
    taskDetailsById = {};
    taskDetailsLoadKey = "";
    taskDetailsLoadToken += 1;
    dependencyLoading = false;
    clearRunContext();
    artifacts = [];
    artifactsCursor = null;
    artifactsScopeKey = "";
    artifactLoadKey = "";
    artifactScope = initialArtifactScope;
    artifactTaskFilter = "";
    artifactRunFilter = "";
    claimed = null;
    if (running) {
      void refreshAll();
    }
  });

  $effect(() => {
    if (!active || component !== "nulltickets" || !running || !shouldLoadVisibleTaskDetails()) return;
    if (tasks.length === 0) return;
    void loadVisibleTaskDetails(tasks);
  });

  $effect(() => {
    if (!active || component !== "nulltickets" || !running || panelView !== "artifacts") return;
    const scope = artifactScopeParams();
    const scopeKey = artifactScopeCacheKey(scope);
    const nextLoadKey = `${component}/${name}/${scopeKey}/${artifactLimit}`;
    if (artifactLoadKey === nextLoadKey) return;
    artifactLoadKey = nextLoadKey;
    void loadArtifacts(false);
  });
</script>

<div class="tickets-panel">
  {#if !running}
    <PageHeader {title} subtitle={headerSubtitle} />
    <div class="empty-state">Instance is stopped.</div>
  {:else}
    <PageHeader {title} subtitle={headerSubtitle}>
      {#snippet controls()}
        {#if visiblePanelViews.length > 1}
          <div class="view-tabs" role="tablist" aria-label="NullTickets views">
            {#each visiblePanelViews as view (view)}
              <button
                type="button"
                role="tab"
                aria-selected={panelView === view}
                class:active={panelView === view}
                onclick={() => setPanelView(view)}
              >
                {panelViewLabels[view]}
              </button>
            {/each}
          </div>
        {/if}

        {#if panelView === "tasks"}
          <Select bind:value={filterPipeline} aria-label="Filter by process" class="ph-field">
            <option value="">All processes</option>
            {#each pipelines as pipeline}
              <option value={pipelineId(pipeline)}>{pipelineName(pipeline)}</option>
            {/each}
          </Select>
          <Input bind:value={filterStage} placeholder="Stage" aria-label="Filter by stage" class="ph-field ph-field-sm" />
          <Input bind:value={taskLimit} inputmode="numeric" aria-label="Limit" placeholder="Limit" class="ph-field ph-field-xs" />
          <Button variant="outline" size="sm" onclick={() => loadTasks(false)} disabled={loading}>Apply</Button>
        {:else if panelView === "artifacts"}
          <Select bind:value={artifactScope} onchange={() => setArtifactScope(artifactScope)} aria-label="Artifact scope" class="ph-field">
            <option value="selected">Selected</option>
            <option value="custom">Custom</option>
            <option value="all">All</option>
          </Select>
          {#if artifactScope === "custom"}
            <Input bind:value={artifactTaskFilter} placeholder="Task ID" aria-label="Task ID" class="ph-field ph-field-sm" />
            <Input bind:value={artifactRunFilter} placeholder="Run ID" aria-label="Run ID" class="ph-field ph-field-sm" />
          {/if}
          <Input bind:value={artifactLimit} inputmode="numeric" aria-label="Limit" placeholder="Limit" class="ph-field ph-field-xs" />
          <Button variant="outline" size="sm" onclick={() => loadArtifacts(false)} disabled={loading}>Load</Button>
        {:else if panelView === "runs"}
          <Input bind:value={runEventsLimit} inputmode="numeric" aria-label="Events limit" placeholder="Limit" class="ph-field ph-field-xs" />
          <Button variant="outline" size="sm" onclick={() => loadRunEvents(false)} disabled={loading || !selectedRunId}>Load events</Button>
        {/if}
      {/snippet}
      {#snippet actions()}
        <Button variant="outline" size="sm" onclick={refreshAll} disabled={loading || actionLoading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
        {#if panelView === "tasks" && workMode === "tasks"}
          <Button size="sm" onclick={() => (showCreateTask = true)}>+ New task</Button>
        {:else if panelView === "pipelines"}
          <Button size="sm" onclick={() => (showCreateProcess = true)}>+ New process</Button>
        {:else if panelView === "artifacts"}
          <Button size="sm" onclick={() => (showCreateArtifact = true)}>+ New artifact</Button>
        {/if}
      {/snippet}
    </PageHeader>

    {#if error}
      <div class="banner banner-error">{error}</div>
    {/if}
    {#if message}
      <div class="banner banner-info">{message}</div>
    {/if}

    {#if panelView === "tasks" && workMode === "planner"}
      <div class="split-grid">
        <section class="split-list-pane">
          <div class="insight-grid">
            <div class="insight-card">
              <span>Visible tasks</span>
              <strong>{tasks.length}</strong>
            </div>
            <div class="insight-card">
              <span>Processes</span>
              <strong>{visibleProcessCount()}</strong>
            </div>
            <div class="insight-card">
              <span>Stages</span>
              <strong>{visibleStageCount()}</strong>
            </div>
            <div class="insight-card">
              <span>Top priority</span>
              <strong>{highestPriorityTask() ? `p${taskPriority(highestPriorityTask())}` : "-"}</strong>
            </div>
          </div>

          {#if tasks.length === 0}
            <div class="empty-row">No tasks match this plan.</div>
          {:else}
            <div class="process-plan-list">
              {#each planningGroups() as group (group.id)}
                <div class="process-plan">
                  <div class="process-plan-header">
                    <div class="process-plan-title">
                      <span class="item-title">{group.name}</span>
                      <span class="item-meta">{group.tasks.length} tasks · top p{group.maxPriority}</span>
                    </div>
                    <div class="badge-row">
                      {#each group.stages as item}
                        <Badge variant="outline">{item.stage} · {item.count}</Badge>
                      {/each}
                    </div>
                  </div>
                  <div class="plan-task-list">
                    {#each group.tasks as task (taskId(task))}
                      <button
                        type="button"
                        class="list-row plan-task"
                        class:active={taskId(task) === selectedTaskId}
                        onclick={() => selectTask(taskId(task))}
                      >
                        <span class="plan-priority">p{taskPriority(task)}</span>
                        <span class="list-row-text">
                          <span class="item-title">{taskTitle(task)}</span>
                          <span class="item-meta">{taskStage(task)} · {taskDependencyList(task).length} deps · {formatTime(task.created_at_ms)}</span>
                        </span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
          {#if nextCursor}
            <Button variant="ghost" size="sm" onclick={() => loadTasks(true)} disabled={loading}>Load more</Button>
          {/if}
        </section>

        <aside class="split-detail-pane">
          {#if selectedTaskLoading}
            <p class="detail-loading">Loading…</p>
          {/if}
          {#if selectedTask}
            <div class="detail-stack">
              <div class="detail-head">
                <h3 class="detail-title">{taskTitle(selectedTask)}</h3>
                <code class="detail-id">{selectedTask.id}</code>
              </div>
              <div class="stats-grid">
                <div class="stat"><span>Stage</span><strong>{selectedTask.stage || "-"}</strong></div>
                <div class="stat"><span>Process</span><strong>{processNameById(selectedTask.pipeline_id)}</strong></div>
                <div class="stat"><span>Priority</span><strong>{selectedTask.priority ?? 0}</strong></div>
                <div class="stat"><span>Deps</span><strong>{taskDependencyList(selectedTask).length}</strong></div>
              </div>
              {#if selectedTask.description}
                <p class="detail-description">{selectedTask.description}</p>
              {/if}
              {#if taskTransitions.length > 0}
                <div class="detail-block">
                  <span class="detail-subhead">Transitions</span>
                  <div class="badge-row">
                    {#each taskTransitions as transition}
                      <Badge variant="secondary">{transition.trigger || "-"} → {transition.to || transition.new_stage || "-"}</Badge>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <div class="detail-empty">Select a task from the plan.</div>
          {/if}

          <div class="detail-block detail-block-divided">
            <span class="detail-subhead">Next up</span>
            <div class="list-stack">
              {#each sortedPlanningTasks().slice(0, 6) as task (taskId(task))}
                <button
                  type="button"
                  class="list-row"
                  class:active={taskId(task) === selectedTaskId}
                  onclick={() => selectTask(taskId(task))}
                >
                  <span class="list-row-text">
                    <span class="item-title">{taskTitle(task)}</span>
                    <span class="item-meta">p{taskPriority(task)} · {taskStage(task)} · {processNameById(task.pipeline_id)}</span>
                  </span>
                </button>
              {:else}
                <div class="empty-row">No planned tasks.</div>
              {/each}
            </div>
          </div>
        </aside>
      </div>
    {:else if panelView === "tasks" && workMode === "dependencies"}
      <div class="split-grid">
        <section class="split-list-pane">
          <div class="insight-grid">
            <div class="insight-card">
              <span>Visible tasks</span>
              <strong>{tasks.length}</strong>
            </div>
            <div class="insight-card">
              <span>Blocked</span>
              <strong>{blockedTaskCount()}</strong>
            </div>
            <div class="insight-card">
              <span>Ready</span>
              <strong>{readyTaskCount()}</strong>
            </div>
            <div class="insight-card">
              <span>Edges</span>
              <strong>{dependencyEdges().length}</strong>
            </div>
          </div>

          <div class="dependency-list">
            {#if dependencyEdges().length === 0}
              <div class="empty-row">{dependencyLoading ? "Loading dependency details…" : "No dependencies in the current filter."}</div>
            {:else}
              {#each dependencyEdges() as edge (`${taskId(edge.task)}:${edge.dependsOnId}`)}
                <button
                  type="button"
                  class="list-row dependency-row"
                  class:active={taskId(edge.task) === selectedTaskId || edge.dependsOnId === selectedTaskId}
                  onclick={() => selectTask(taskId(edge.task))}
                >
                  <span class="dependency-node">
                    <span class="item-title">{taskTitle(edge.task)}</span>
                    <span class="item-meta">{taskStage(edge.task)} · {processNameById(edge.task.pipeline_id)}</span>
                  </span>
                  <span class="dependency-arrow">depends on</span>
                  <span class="dependency-node">
                    <span class="item-title">{edge.dependsOnTitle}</span>
                    <span class="item-meta">{edge.satisfied ? edge.dependsOnId : "outside current filter"}</span>
                  </span>
                </button>
              {/each}
            {/if}
          </div>
          {#if nextCursor}
            <Button variant="ghost" size="sm" onclick={() => loadTasks(true)} disabled={loading}>Load more</Button>
          {/if}
        </section>

        <aside class="split-detail-pane">
          {#if selectedTaskLoading}
            <p class="detail-loading">Loading…</p>
          {/if}
          {#if selectedTask}
            <div class="detail-stack">
              <div class="detail-head">
                <h3 class="detail-title">{taskTitle(selectedTask)}</h3>
                <code class="detail-id">{selectedTask.id}</code>
              </div>
              <div class="stats-grid">
                <div class="stat"><span>Blocked by</span><strong>{selectedDependencyEdges().length}</strong></div>
                <div class="stat"><span>Blocking</span><strong>{tasksBlockingSelected().length}</strong></div>
                <div class="stat"><span>Stage</span><strong>{selectedTask.stage || "-"}</strong></div>
                <div class="stat"><span>Priority</span><strong>{selectedTask.priority ?? 0}</strong></div>
              </div>

              <div class="detail-block">
                <span class="detail-subhead">Blocked by</span>
                {#if selectedDependencyEdges().length > 0}
                  <div class="badge-row">
                    {#each selectedDependencyEdges() as edge}
                      <button
                        type="button"
                        class="badge-button"
                        onclick={() => edge.dependsOnId && selectTask(edge.dependsOnId)}
                        disabled={!edge.satisfied}
                      >
                        <Badge variant={edge.satisfied ? "secondary" : "outline"}>{edge.dependsOnTitle}</Badge>
                      </button>
                    {/each}
                  </div>
                {:else}
                  <span class="detail-muted">No blockers.</span>
                {/if}
              </div>

              <div class="detail-block">
                <span class="detail-subhead">Blocking</span>
                {#if tasksBlockingSelected().length > 0}
                  <div class="badge-row">
                    {#each tasksBlockingSelected() as task}
                      <button type="button" class="badge-button" onclick={() => selectTask(taskId(task))}>
                        <Badge variant="secondary">{taskTitle(task)}</Badge>
                      </button>
                    {/each}
                  </div>
                {:else}
                  <span class="detail-muted">Not blocking visible tasks.</span>
                {/if}
              </div>

              <div class="detail-block">
                <Label for="dep-add-input">Add dependency</Label>
                <div class="inline-form">
                  <Input id="dep-add-input" bind:value={dependencyTaskId} placeholder="task-id" />
                  <Button onclick={addDependency} disabled={actionLoading || !dependencyTaskId.trim()}>Add</Button>
                </div>
              </div>
            </div>
          {:else}
            <div class="detail-empty">Select a task to inspect blockers.</div>
          {/if}
        </aside>
      </div>
    {:else if panelView === "tasks"}
      <div class="split-grid">
        <section class="split-list-pane list-pane-flush">
          <UniversalEntityView
            hideHeader
            title="Tasks"
            description="Visible NullTickets tasks for this backend."
            records={taskRecords}
            columns={taskColumns}
            views={taskViews}
            defaultViewId="split"
            {loading}
            error={error || null}
            actions={taskActions}
            emptyTitle="No tasks"
            emptyDescription="No tasks match the current filter."
            onRefresh={() => loadTasks(false)}
            onSelect={(record) => void selectTask(taskRecordId(record))}
            onOpen={(record) => void selectTask(taskRecordId(record))}
          />
          {#if nextCursor}
            <Button variant="ghost" size="sm" onclick={() => loadTasks(true)} disabled={loading}>Load more</Button>
          {/if}
        </section>

        <aside class="split-detail-pane">
          {#if selectedTaskLoading}
            <p class="detail-loading">Loading…</p>
          {/if}
          {#if selectedTask}
            <div class="detail-stack">
              <div class="detail-head">
                <h3 class="detail-title">{taskTitle(selectedTask)}</h3>
                <code class="detail-id">{selectedTask.id}</code>
              </div>
              <div class="stats-grid">
                <div class="stat"><span>Stage</span><strong>{selectedTask.stage || "-"}</strong></div>
                <div class="stat"><span>Process</span><strong>{processNameById(selectedTask.pipeline_id)}</strong></div>
                <div class="stat"><span>Priority</span><strong>{selectedTask.priority ?? 0}</strong></div>
                <div class="stat"><span>Version</span><strong>{selectedTask.task_version ?? "-"}</strong></div>
              </div>
              {#if selectedRun}
                <div class="detail-block">
                  <span class="detail-subhead">Latest run</span>
                  <div class="stats-grid">
                    <div class="stat"><span>Run</span><strong class="mono">{runId(selectedRun) || "-"}</strong></div>
                    <div class="stat"><span>Status</span><strong><Badge variant={runBadgeVariant(selectedRun.status)}>{selectedRun.status || "-"}</Badge></strong></div>
                    <div class="stat"><span>Agent</span><strong>{selectedRun.agent_id || "-"}</strong></div>
                    <div class="stat"><span>Attempt</span><strong>{selectedRun.attempt ?? "-"}</strong></div>
                  </div>
                </div>
              {/if}
              {#if selectedTask.description}
                <p class="detail-description">{selectedTask.description}</p>
              {/if}
              <div class="detail-columns">
                <div class="detail-block">
                  <span class="detail-subhead">Assignments</span>
                  {#if activeTaskAssignments.length > 0}
                    <div class="badge-row">
                      {#each activeTaskAssignments as assignment}
                        <button
                          type="button"
                          class="badge-button"
                          onclick={() => unassignTask(String(assignment.agent_id || ""))}
                          disabled={actionLoading}
                          title="Unassign"
                        >
                          <Badge variant="secondary">{assignment.agent_id}</Badge>
                        </button>
                      {/each}
                    </div>
                  {:else}
                    <span class="detail-muted">None</span>
                  {/if}
                </div>
                <div class="detail-block">
                  <span class="detail-subhead">Dependencies</span>
                  {#if taskDependencies.length > 0}
                    <div class="badge-row">
                      {#each taskDependencies as dep}
                        <Badge variant="outline">{dep.depends_on_task_id || dep.task_id || dep}</Badge>
                      {/each}
                    </div>
                  {:else}
                    <span class="detail-muted">None</span>
                  {/if}
                </div>
              </div>
              {#if taskTransitions.length > 0}
                <div class="detail-block">
                  <span class="detail-subhead">Transitions</span>
                  <div class="badge-row">
                    {#each taskTransitions as transition}
                      <Badge variant="secondary">{transition.trigger || "-"} → {transition.to || transition.new_stage || "-"}</Badge>
                    {/each}
                  </div>
                </div>
              {/if}
              <div class="detail-block">
                <span class="detail-subhead">Metadata</span>
                <pre class="json-block">{jsonPreview(selectedTask.metadata)}</pre>
              </div>
              <div class="detail-block detail-actions">
                <div class="inline-form">
                  <div class="inline-form-field">
                    <Label for="assign-agent-input">Assign agent</Label>
                    <Input id="assign-agent-input" bind:value={assignAgent} placeholder="agent-id" />
                  </div>
                  <Button onclick={assignTask} disabled={actionLoading || !assignAgent.trim()}>Assign</Button>
                </div>
                <div class="inline-form">
                  <div class="inline-form-field">
                    <Label for="task-dep-input">Add dependency</Label>
                    <Input id="task-dep-input" bind:value={dependencyTaskId} placeholder="task-id" />
                  </div>
                  <Button onclick={addDependency} disabled={actionLoading || !dependencyTaskId.trim()}>Add</Button>
                </div>
                <div class="detail-shortcuts">
                  {#if canShowPanelView("runs")}
                    <Button variant="outline" size="sm" onclick={() => setPanelView("runs")} disabled={!selectedRunId}>Run controls</Button>
                  {/if}
                  {#if canShowPanelView("artifacts")}
                    <Button variant="outline" size="sm" onclick={openSelectedArtifacts}>Artifacts</Button>
                  {/if}
                </div>
              </div>
            </div>
          {:else}
            <div class="detail-empty">No task selected.</div>
          {/if}
        </aside>
      </div>
    {:else if panelView === "pipelines"}
      <div class="split-grid">
        <section class="split-list-pane">
          {#if loading && pipelines.length === 0}
            <div class="empty-row">Loading processes…</div>
          {:else if pipelines.length === 0}
            <div class="empty-row">Create a process definition to populate this view.</div>
          {:else}
            <div class="list-stack">
              {#each pipelines as pipeline (pipelineId(pipeline))}
                {@const states = pipelineStateCount(pipeline)}
                <button
                  type="button"
                  class="list-row process-row"
                  class:active={pipelineId(pipeline) === selectedPipelineId}
                  onclick={() => (selectedPipelineId = pipelineId(pipeline))}
                >
                  <span class="list-row-text">
                    <span class="item-title">{pipelineName(pipeline)}</span>
                    <span class="item-meta">{states} {states === 1 ? "state" : "states"}</span>
                  </span>
                  <Badge variant="outline">{stateRange(states)}</Badge>
                </button>
              {/each}
            </div>
          {/if}
        </section>

        <aside class="split-detail-pane">
          {#if selectedPipeline}
            <div class="detail-stack">
              <div class="detail-head">
                <h3 class="detail-title">{pipelineName(selectedPipeline)}</h3>
                <code class="detail-id">{pipelineId(selectedPipeline)}</code>
              </div>
              <div class="stats-grid">
                <div class="stat"><span>States</span><strong>{pipelineStateCount(selectedPipeline)}</strong></div>
                <div class="stat"><span>Created</span><strong>{formatTime(selectedPipeline.created_at_ms)}</strong></div>
              </div>
              {#if pipelineStateList(selectedPipeline).length > 0}
                <div class="detail-block">
                  <span class="detail-subhead">States</span>
                  <div class="state-list">
                    {#each pipelineStateList(selectedPipeline) as state (state.name)}
                      <div class="state-item">
                        <div class="state-item-head">
                          <span class="item-title">{state.name}</span>
                          {#if state.initial}<Badge variant="secondary">initial</Badge>{/if}
                          {#if state.terminal}<Badge variant="muted">terminal</Badge>{/if}
                          {#if state.agentRole}<Badge variant="outline">{state.agentRole}</Badge>{/if}
                        </div>
                        {#if state.description}
                          <p class="state-item-desc">{state.description}</p>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
              <div class="detail-block">
                <span class="detail-subhead">Definition</span>
                <pre class="json-block">{jsonPreview(selectedPipeline.definition)}</pre>
              </div>
            </div>
          {:else}
            <div class="detail-empty">No process selected.</div>
          {/if}
        </aside>
      </div>
    {:else if panelView === "queue"}
      <div class="split-grid">
        <section class="split-list-pane list-pane-flush">
          <UniversalEntityView
            hideHeader
            title="Queue"
            description="Role-level dispatch capacity and failure counters."
            records={queueRecords}
            columns={queueColumns}
            views={queueViews}
            defaultViewId="table"
            {loading}
            error={error || null}
            actions={queueActions}
            emptyTitle="No queue stats"
            emptyDescription="Queue counters are not available for this backend."
            onRefresh={refreshAll}
            onSelect={(record) => (claimRole = String(record.fields?.role || "coder"))}
            onOpen={(record) => (claimRole = String(record.fields?.role || "coder"))}
          />
        </section>

        <aside class="split-detail-pane">
          <div class="detail-stack">
            <div class="detail-head">
              <h3 class="detail-title">Claim next task</h3>
            </div>
            {#if queueRoles.length > 0}
              <div class="detail-block">
                <span class="detail-subhead">Roles</span>
                <div class="badge-row">
                  {#each queueRoles as role}
                    {@const status = role.failed_count || role.stuck_count ? "attention" : role.claimable_count ? "claimable" : "idle"}
                    <button type="button" class="badge-button" onclick={() => (claimRole = String(role.role || "coder"))}>
                      <Badge variant={queueBadgeVariant(status)}>{role.role || "coder"} · {role.claimable_count || 0}</Badge>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
            <div class="form-grid">
              <div class="form-field">
                <Label for="claim-agent">Agent</Label>
                <Input id="claim-agent" bind:value={claimAgent} placeholder="nullhub" />
              </div>
              <div class="form-field">
                <Label for="claim-role">Role</Label>
                <Select id="claim-role" bind:value={claimRole}>
                  {#if queueRoles.length === 0}
                    <option value="coder">coder</option>
                  {:else}
                    {#each queueRoles as role}
                      <option value={role.role || "coder"}>{role.role || "coder"}</option>
                    {/each}
                  {/if}
                </Select>
              </div>
              <div class="form-field">
                <Label for="claim-ttl">Lease TTL (ms)</Label>
                <Input id="claim-ttl" bind:value={claimTtl} inputmode="numeric" />
              </div>
            </div>
            <div class="form-actions">
              <Button onclick={claimNext} disabled={actionLoading || !claimRole.trim()}>Claim next</Button>
            </div>
            {#if claimed?.task}
              <div class="detail-block detail-block-divided">
                <span class="detail-subhead">Claimed</span>
                <div class="claimed-box">
                  <span class="item-title">{taskTitle(claimed.task)}</span>
                  <code class="detail-id">{claimed.lease_id}</code>
                </div>
              </div>
            {/if}
          </div>
        </aside>
      </div>
    {:else if panelView === "runs"}
      <div class="split-grid split-grid-runs">
        <aside class="split-detail-pane">
          <div class="detail-head">
            <h3 class="detail-title">Run</h3>
            {#if selectedRunId}<code class="detail-id">{selectedRunId}</code>{/if}
          </div>
          {#if selectedRun}
            <div class="detail-stack">
              <div class="stats-grid">
                <div class="stat"><span>Status</span><strong><Badge variant={runBadgeVariant(selectedRun.status)}>{selectedRun.status || "-"}</Badge></strong></div>
                <div class="stat"><span>Task</span><strong class="mono">{selectedRun.task_id || selectedTaskId || "-"}</strong></div>
                <div class="stat"><span>Agent</span><strong>{selectedRun.agent_id || "-"}</strong></div>
                <div class="stat"><span>Role</span><strong>{selectedRun.agent_role || "-"}</strong></div>
                <div class="stat"><span>Started</span><strong>{formatTime(selectedRun.started_at_ms)}</strong></div>
                <div class="stat"><span>Ended</span><strong>{formatTime(selectedRun.ended_at_ms)}</strong></div>
              </div>

              <div class="detail-block">
                <span class="detail-subhead">Lease</span>
                <div class="form-grid">
                  <div class="form-field">
                    <Label for="lease-id">Lease ID</Label>
                    <Input id="lease-id" bind:value={runLeaseId} placeholder="lease id from claim" />
                  </div>
                  <div class="form-field">
                    <Label for="lease-token">Lease token</Label>
                    <Input id="lease-token" bind:value={runLeaseToken} placeholder="token from claim" />
                  </div>
                </div>
                <div class="form-actions">
                  <Button variant="outline" onclick={heartbeatLease} disabled={actionLoading || !runLeaseId.trim() || !runLeaseToken.trim()}>Heartbeat</Button>
                  {#if heartbeatExpiresAt}
                    <span class="detail-muted">Lease expires {formatTime(heartbeatExpiresAt)}</span>
                  {/if}
                </div>
              </div>

              {#if taskTransitions.length > 0}
                <div class="detail-block">
                  <span class="detail-subhead">Available transitions</span>
                  <div class="badge-row">
                    {#each taskTransitions as transition}
                      <button
                        type="button"
                        class="badge-button"
                        onclick={() => transitionRun(String(transition.trigger || ""))}
                        disabled={actionLoading || !runLeaseToken.trim()}
                      >
                        <Badge variant="secondary">{transition.trigger || "-"} → {transition.to || "-"}</Badge>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}

              <div class="detail-block">
                <span class="detail-subhead">Transition</span>
                <div class="form-field">
                  <Label for="transition-trigger">Trigger</Label>
                  <Input id="transition-trigger" bind:value={transitionTrigger} placeholder="complete" />
                </div>
                <div class="form-field">
                  <Label for="transition-instructions">Instructions</Label>
                  <Textarea id="transition-instructions" bind:value={transitionInstructions} rows={3} />
                </div>
                <div class="form-field">
                  <Label for="transition-usage">Usage JSON</Label>
                  <Textarea id="transition-usage" bind:value={transitionUsage} rows={4} class="mono" />
                </div>
                <div class="form-actions">
                  <Button onclick={() => transitionRun()} disabled={actionLoading || !transitionTrigger.trim() || !runLeaseToken.trim()}>Transition</Button>
                </div>
              </div>

              <div class="detail-block detail-block-divided">
                <span class="detail-subhead">Fail run</span>
                <div class="form-field">
                  <Label for="fail-reason">Reason</Label>
                  <Textarea id="fail-reason" bind:value={failReason} rows={3} />
                </div>
                <div class="form-field">
                  <Label for="fail-usage">Usage JSON</Label>
                  <Textarea id="fail-usage" bind:value={failUsage} rows={4} class="mono" />
                </div>
                <div class="form-actions">
                  <Button variant="destructive" onclick={failRun} disabled={actionLoading || !failReason.trim() || !runLeaseToken.trim()}>Fail run</Button>
                </div>
              </div>
            </div>
          {:else}
            <div class="detail-empty">Select or claim a task with a run.</div>
          {/if}
        </aside>

        <section class="split-list-pane list-pane-flush">
          <UniversalEntityView
            hideHeader
            title="Events"
            description="Event stream for the selected run."
            records={eventRecords}
            columns={eventColumns}
            views={eventViews}
            defaultViewId="split"
            {loading}
            error={error || null}
            emptyTitle="No events"
            emptyDescription="No events are available for the selected run."
            onRefresh={() => loadRunEvents(false)}
          />
          {#if runEventsCursor}
            <Button variant="ghost" size="sm" onclick={() => loadRunEvents(true)} disabled={loading}>Load more</Button>
          {/if}
          <div class="detail-block detail-block-divided">
            <span class="detail-subhead">Add event</span>
            <div class="inline-form">
              <div class="inline-form-field">
                <Label for="event-kind">Kind</Label>
                <Input id="event-kind" bind:value={eventKind} placeholder="note" />
              </div>
            </div>
            <div class="form-field">
              <Label for="event-data">Data JSON</Label>
              <Textarea id="event-data" bind:value={eventData} rows={5} class="mono" />
            </div>
            <div class="form-actions">
              <Button onclick={addRunEvent} disabled={actionLoading || !selectedRunId || !eventKind.trim() || !runLeaseToken.trim()}>Add event</Button>
            </div>
          </div>
        </section>
      </div>
    {:else}
      <section class="single-pane">
        <UniversalEntityView
          hideHeader
          title="Artifacts"
          description={`Artifacts for ${artifactScopeLabel()}.`}
          records={artifactRecords}
          columns={artifactColumns}
          views={artifactViews}
          defaultViewId="table"
          {loading}
          error={error || null}
          emptyTitle="No artifacts"
          emptyDescription="No artifacts match the current scope."
          onRefresh={() => loadArtifacts(false)}
        />
        {#if artifactsCursor}
          <Button variant="ghost" size="sm" onclick={() => loadArtifacts(true)} disabled={loading}>Load more</Button>
        {/if}
      </section>
    {/if}
  {/if}
</div>

<Dialog bind:open={showCreateProcess} title="New process" description="Define a process and its state machine." size="lg">
  <div class="form-field">
    <Label for="create-process-name">Name</Label>
    <Input id="create-process-name" bind:value={createPipelineName} placeholder="process name" />
  </div>
  <div class="form-field">
    <Label for="create-process-definition">Definition JSON</Label>
    <Textarea id="create-process-definition" bind:value={createPipelineDefinition} rows={14} class="mono" />
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (showCreateProcess = false)}>Cancel</Button>
    <Button
      onclick={async () => {
        await createPipeline();
        if (!error) showCreateProcess = false;
      }}
      disabled={actionLoading || !createPipelineName.trim()}
    >Create process</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={showCreateTask} title="New task" description="Create a task on a process." size="lg">
  <div class="form-grid">
    <div class="form-field">
      <Label for="create-task-process">Process</Label>
      <Select id="create-task-process" bind:value={createTaskPipeline}>
        <option value="">Select</option>
        {#each pipelines as pipeline}
          <option value={pipelineId(pipeline)}>{pipelineName(pipeline)}</option>
        {/each}
      </Select>
    </div>
    <div class="form-field">
      <Label for="create-task-priority">Priority</Label>
      <Input id="create-task-priority" bind:value={createTaskPriority} inputmode="numeric" />
    </div>
  </div>
  <div class="form-field">
    <Label for="create-task-title">Title</Label>
    <Input id="create-task-title" bind:value={createTaskTitle} placeholder="Task title" />
  </div>
  <div class="form-field">
    <Label for="create-task-agent">Assigned agent</Label>
    <Input id="create-task-agent" bind:value={createTaskAssignedAgent} placeholder="optional" />
  </div>
  <div class="form-field">
    <Label for="create-task-description">Description</Label>
    <Textarea id="create-task-description" bind:value={createTaskDescription} rows={3} />
  </div>
  <div class="form-field">
    <Label for="create-task-dependencies">Dependencies</Label>
    <Input id="create-task-dependencies" bind:value={createTaskDependencies} placeholder="task-a, task-b" />
  </div>
  <div class="form-field">
    <Label for="create-task-metadata">Metadata JSON</Label>
    <Textarea id="create-task-metadata" bind:value={createTaskMetadata} rows={4} class="mono" />
  </div>
  <div class="form-field form-field-divided">
    <Label for="create-task-bulk">Bulk tasks JSON</Label>
    <Textarea id="create-task-bulk" bind:value={bulkTasksJson} rows={6} class="mono" />
    <div class="form-actions">
      <Button variant="outline" size="sm" onclick={bulkCreateTasks} disabled={actionLoading}>Bulk create</Button>
    </div>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (showCreateTask = false)}>Cancel</Button>
    <Button
      onclick={async () => {
        await createTask();
        if (!error) showCreateTask = false;
      }}
      disabled={actionLoading ||
        !createTaskTitle.trim() ||
        !(createTaskPipeline.trim() || filterPipeline.trim() || selectedPipelineId.trim())}
    >Create task</Button>
  {/snippet}
</Dialog>

<Dialog bind:open={showCreateArtifact} title="New artifact" description={`Linked to ${artifactScopeLabel()}.`} size="md">
  <div class="form-grid">
    <div class="form-field">
      <Label for="create-artifact-kind">Kind</Label>
      <Input id="create-artifact-kind" bind:value={artifactKind} placeholder="file" />
    </div>
    <div class="form-field">
      <Label for="create-artifact-size">Size bytes</Label>
      <Input id="create-artifact-size" bind:value={artifactSize} inputmode="numeric" />
    </div>
  </div>
  <div class="form-field">
    <Label for="create-artifact-uri">URI</Label>
    <Input id="create-artifact-uri" bind:value={artifactUri} placeholder="file:///tmp/result.txt" />
  </div>
  <div class="form-field">
    <Label for="create-artifact-sha">SHA-256</Label>
    <Input id="create-artifact-sha" bind:value={artifactSha256} placeholder="optional" />
  </div>
  <div class="form-field">
    <Label for="create-artifact-meta">Meta JSON</Label>
    <Textarea id="create-artifact-meta" bind:value={artifactMeta} rows={5} class="mono" />
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (showCreateArtifact = false)}>Cancel</Button>
    <Button
      onclick={async () => {
        await createArtifact();
        if (!error) showCreateArtifact = false;
      }}
      disabled={actionLoading || !artifactKind.trim() || !artifactUri.trim()}
    >Create artifact</Button>
  {/snippet}
</Dialog>

<style>
  .tickets-panel {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1.25rem;
    color: var(--shadcn-foreground);
  }

  /* View tabs in the PageHeader controls */
  .view-tabs {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    padding: 0.1875rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
  }
  .view-tabs button {
    padding: 0.3125rem 0.6875rem;
    border: 0;
    border-radius: calc(var(--shadcn-radius) - 2px);
    background: transparent;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.12s ease, color 0.12s ease;
  }
  .view-tabs button:hover {
    color: var(--shadcn-foreground);
  }
  .view-tabs button.active {
    background: var(--shadcn-card);
    color: var(--shadcn-foreground);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
  }

  /* Header-band fields */
  :global(.tickets-panel .ph-field) {
    width: auto;
    min-width: 9rem;
  }
  :global(.tickets-panel .ph-field-sm) {
    min-width: 7rem;
  }
  :global(.tickets-panel .ph-field-xs) {
    width: 5rem;
    min-width: 5rem;
  }

  /* Banners */
  .banner {
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }
  .banner-error {
    border-color: color-mix(in srgb, var(--shadcn-destructive) 35%, var(--shadcn-border));
    background: color-mix(in srgb, var(--shadcn-destructive) 6%, var(--shadcn-card));
    color: var(--shadcn-destructive);
  }
  .banner-info {
    color: var(--shadcn-foreground);
  }

  /* Split layout */
  .split-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 1.25rem;
    align-items: start;
    min-width: 0;
  }
  .split-grid-runs {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  }
  .single-pane {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.75rem;
  }
  .split-list-pane {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.75rem;
  }
  .list-pane-flush {
    gap: 0.5rem;
  }
  .split-detail-pane {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
  }

  /* List rows */
  .list-stack {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.375rem;
  }
  .list-row {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6875rem 0.875rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
    color: var(--shadcn-foreground);
    text-align: left;
    cursor: pointer;
    transition: background-color 0.12s ease, border-color 0.12s ease;
  }
  .list-row:hover {
    background: var(--shadcn-accent);
  }
  .list-row.active {
    border-color: var(--shadcn-foreground);
    background: var(--shadcn-accent);
  }
  .list-row-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.125rem;
  }
  .item-title {
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .item-meta {
    color: var(--shadcn-muted-foreground);
    font-size: 0.78125rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  /* Detail panel */
  .detail-stack {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1rem;
  }
  .detail-loading {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }
  .detail-head {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .detail-title {
    margin: 0;
    color: var(--shadcn-foreground);
    font-size: 1.0625rem;
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .detail-id {
    color: var(--shadcn-muted-foreground);
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.78125rem;
    overflow-wrap: anywhere;
  }
  .detail-description {
    margin: 0;
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .detail-block {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.5rem;
  }
  .detail-block-divided,
  .form-field-divided {
    padding-top: 1rem;
    border-top: 1px solid var(--shadcn-border);
  }
  .detail-subhead {
    color: var(--shadcn-muted-foreground);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.2;
  }
  .detail-muted {
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
  }
  .detail-columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1rem;
  }
  .detail-empty {
    padding: 1.25rem 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
  }
  .detail-actions {
    gap: 0.75rem;
    padding-top: 1rem;
    border-top: 1px solid var(--shadcn-border);
  }
  .detail-shortcuts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* Stats */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    gap: 0.5rem;
  }
  .stat {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
  }
  .stat span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.71875rem;
    line-height: 1.2;
  }
  .stat strong {
    color: var(--shadcn-foreground);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .stat strong.mono {
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  /* Insight cards */
  .insight-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: 0.5rem;
  }
  .insight-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
  }
  .insight-card span {
    color: var(--shadcn-muted-foreground);
    font-size: 0.71875rem;
    line-height: 1.2;
  }
  .insight-card strong {
    color: var(--shadcn-foreground);
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.2;
  }

  /* Badges */
  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .badge-button {
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .badge-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  /* JSON / mono blocks */
  .json-block {
    max-height: 22rem;
    overflow: auto;
    margin: 0;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
    color: var(--shadcn-foreground);
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.78125rem;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  :global(.tickets-panel textarea.mono),
  :global(.dialog-content textarea.mono) {
    font-family: var(--prin7r-font-mono-standard);
  }

  /* Forms */
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.875rem;
  }
  .form-field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.375rem;
  }
  .form-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }
  .inline-form {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
  }
  .inline-form-field {
    display: flex;
    min-width: 0;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.375rem;
  }

  /* Process plan (planner) */
  .process-plan-list {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.75rem;
  }
  .process-plan {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.875rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
  }
  .process-plan-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .process-plan-title {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.125rem;
  }
  .plan-task-list {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.375rem;
  }
  .plan-task {
    align-items: center;
    gap: 0.625rem;
    justify-content: flex-start;
  }
  .plan-priority {
    flex: 0 0 auto;
    min-width: 2.25rem;
    padding: 0.1875rem 0.375rem;
    border: 1px solid var(--shadcn-border);
    border-radius: calc(var(--shadcn-radius) - 2px);
    background: var(--shadcn-muted);
    color: var(--shadcn-foreground);
    font-family: var(--prin7r-font-mono-standard);
    font-size: 0.71875rem;
    font-weight: 600;
    text-align: center;
  }

  /* Dependency map */
  .dependency-list {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.375rem;
    max-height: 40rem;
    overflow: auto;
  }
  .dependency-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
  }
  .dependency-node {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.125rem;
  }
  .dependency-arrow {
    color: var(--shadcn-muted-foreground);
    font-size: 0.71875rem;
    white-space: nowrap;
  }

  /* Pipeline states */
  .state-list {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.5rem;
  }
  .state-item {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
  }
  .state-item-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }
  .state-item-desc {
    margin: 0;
    color: var(--shadcn-muted-foreground);
    font-size: 0.8125rem;
    line-height: 1.45;
  }

  /* Claimed box */
  .claimed-box {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-muted);
  }

  /* Empty rows / states */
  .empty-row,
  .empty-state {
    padding: 1rem 0.875rem;
    border: 1px dashed var(--shadcn-border);
    border-radius: var(--shadcn-radius);
    background: var(--shadcn-card);
    color: var(--shadcn-muted-foreground);
    font-size: 0.875rem;
    text-align: center;
  }

  @media (max-width: 900px) {
    .split-grid,
    .split-grid-runs {
      grid-template-columns: 1fr;
    }
    .dependency-row {
      grid-template-columns: 1fr;
      gap: 0.375rem;
    }
    .dependency-arrow {
      white-space: normal;
    }
  }
</style>
