<script lang="ts">
  import { api } from "$lib/api/client";
  import {
    UniversalEntityView,
    createViewSet,
    type EntityColumn,
    type EntityRecord,
    type EntityViewAction,
  } from "$lib/entity-view";

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
    const ids = items.map((task) => taskId(task)).filter(Boolean);
    if (ids.length === 0) {
      taskDetailsLoadToken += 1;
      taskDetailsById = {};
      taskDetailsLoadKey = "";
      return;
    }
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
      if (selectedStillVisible) {
        await selectTask(selectedTaskId);
      } else if (items.length > 0) {
        await selectTask(taskId(items[0]));
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
    <div class="empty-state">Instance is stopped.</div>
  {:else}
    <div class="tickets-header">
      <div class="tickets-heading">
        <h2>{title}</h2>
        {#if subtitle}
          <p>{subtitle}</p>
        {/if}
      </div>
      {#if visiblePanelViews.length > 1}
        <div class="tickets-tabs" role="tablist" aria-label="NullTickets views">
          {#each visiblePanelViews as view (view)}
            <button class:active={panelView === view} onclick={() => setPanelView(view)}>
              {panelViewLabels[view]}
            </button>
          {/each}
        </div>
      {/if}
      <button class="btn" onclick={refreshAll} disabled={loading || actionLoading}>
        {loading ? "Refreshing..." : "Refresh"}
      </button>
    </div>

    {#if error}
      <div class="error-banner">{error}</div>
    {/if}
    {#if message}
      <div class="message-banner">{message}</div>
    {/if}

    {#if panelView === "tasks" && workMode === "planner"}
      <div class="planner-grid">
        <section class="tickets-section full">
          <div class="section-header">
            <h3>Planning Filters</h3>
            <span>{tasks.length} visible</span>
          </div>
          <div class="filter-grid">
            <label class="field">
              <span>Process</span>
              <select bind:value={filterPipeline}>
                <option value="">All</option>
                {#each pipelines as pipeline}
                  <option value={pipelineId(pipeline)}>{pipelineName(pipeline)}</option>
                {/each}
              </select>
            </label>
            <label class="field">
              <span>Stage</span>
              <input bind:value={filterStage} placeholder="todo" />
            </label>
            <label class="field small">
              <span>Limit</span>
              <input bind:value={taskLimit} inputmode="numeric" />
            </label>
            <button class="btn" onclick={() => loadTasks(false)} disabled={loading}>Apply</button>
          </div>
        </section>

        <section class="tickets-section planner-main">
          <div class="section-header">
            <h3>Plan by Process</h3>
            <span>{planningGroups().length} processes</span>
          </div>
          <div class="insight-grid">
            <div class="insight-card">
              <span>Visible Tasks</span>
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
              <span>Top Priority</span>
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
                    <div>
                      <span class="task-title">{group.name}</span>
                      <span class="task-meta">{group.tasks.length} tasks / top p{group.maxPriority}</span>
                    </div>
                    <div class="stage-strip">
                      {#each group.stages as item}
                        <span>{item.stage} {item.count}</span>
                      {/each}
                    </div>
                  </div>
                  <div class="planner-task-list">
                    {#each group.tasks as task (taskId(task))}
                      <button
                        class="planner-task"
                        class:active={taskId(task) === selectedTaskId}
                        onclick={() => selectTask(taskId(task))}
                      >
                        <span class="planner-priority">p{taskPriority(task)}</span>
                        <span>
                          <span class="task-title">{taskTitle(task)}</span>
                          <span class="task-meta">
                            {taskStage(task)} / {taskDependencyList(task).length} deps / {formatTime(task.created_at_ms)}
                          </span>
                        </span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
          {#if nextCursor}
            <button class="btn subtle" onclick={() => loadTasks(true)} disabled={loading}>
              Load More
            </button>
          {/if}
        </section>

        <section class="tickets-section planner-side">
          <div class="section-header">
            <h3>Next Up</h3>
            <span>{Math.min(sortedPlanningTasks().length, 6)}</span>
          </div>
          <div class="task-list compact">
            {#each sortedPlanningTasks().slice(0, 6) as task (taskId(task))}
              <button
                class="task-row"
                class:active={taskId(task) === selectedTaskId}
                onclick={() => selectTask(taskId(task))}
              >
                <span class="task-title">{taskTitle(task)}</span>
                <span class="task-meta">
                  p{taskPriority(task)} / {taskStage(task)} / {processNameById(task.pipeline_id)}
                </span>
              </button>
            {:else}
              <div class="empty-row">No planned tasks</div>
            {/each}
          </div>

          <div class="selected-plan">
            <div class="section-header inner">
              <h3>Selected Task</h3>
              {#if selectedTaskLoading}<span>Loading</span>{/if}
            </div>
            {#if selectedTask}
              <div class="detail-stack">
                <div class="detail-title">
                  <span>{taskTitle(selectedTask)}</span>
                  <code>{selectedTask.id}</code>
                </div>
                <div class="stats-grid">
                  <div><span>Stage</span><strong>{selectedTask.stage || "-"}</strong></div>
                  <div><span>Process</span><strong>{processNameById(selectedTask.pipeline_id)}</strong></div>
                  <div><span>Priority</span><strong>{selectedTask.priority ?? 0}</strong></div>
                  <div><span>Deps</span><strong>{taskDependencyList(selectedTask).length}</strong></div>
                </div>
                {#if selectedTask.description}
                  <p class="description">{selectedTask.description}</p>
                {/if}
                {#if taskTransitions.length > 0}
                  <div>
                    <span class="subhead">Transitions</span>
                    <div class="pill-list">
                      {#each taskTransitions as transition}
                        <span class="pill static">
                          {transition.trigger || "-"} -> {transition.to || transition.new_stage || "-"}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="empty-row">Select a task from the plan.</div>
            {/if}
          </div>
        </section>
      </div>
    {:else if panelView === "tasks" && workMode === "dependencies"}
      <div class="dependency-grid">
        <section class="tickets-section full">
          <div class="section-header">
            <h3>Dependency Filters</h3>
            <span>{dependencyLoading ? "loading details" : `${dependencyEdges().length} edges`}</span>
          </div>
          <div class="filter-grid">
            <label class="field">
              <span>Process</span>
              <select bind:value={filterPipeline}>
                <option value="">All</option>
                {#each pipelines as pipeline}
                  <option value={pipelineId(pipeline)}>{pipelineName(pipeline)}</option>
                {/each}
              </select>
            </label>
            <label class="field">
              <span>Stage</span>
              <input bind:value={filterStage} placeholder="todo" />
            </label>
            <label class="field small">
              <span>Limit</span>
              <input bind:value={taskLimit} inputmode="numeric" />
            </label>
            <button class="btn" onclick={() => loadTasks(false)} disabled={loading}>Apply</button>
          </div>
        </section>

        <section class="tickets-section dependency-main">
          <div class="section-header">
            <h3>Dependency Map</h3>
            <span>{dependencyEdges().length}</span>
          </div>
          <div class="insight-grid">
            <div class="insight-card">
              <span>Visible Tasks</span>
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
              <div class="empty-row">No dependencies in the current filter.</div>
            {:else}
              {#each dependencyEdges() as edge (`${taskId(edge.task)}:${edge.dependsOnId}`)}
                <button
                  class="dependency-row"
                  class:active={taskId(edge.task) === selectedTaskId || edge.dependsOnId === selectedTaskId}
                  onclick={() => selectTask(taskId(edge.task))}
                >
                  <span class="dependency-node">
                    <strong>{taskTitle(edge.task)}</strong>
                    <small>{taskStage(edge.task)} / {processNameById(edge.task.pipeline_id)}</small>
                  </span>
                  <span class="dependency-arrow">depends on</span>
                  <span class="dependency-node">
                    <strong>{edge.dependsOnTitle}</strong>
                    <small>{edge.satisfied ? edge.dependsOnId : "outside current filter"}</small>
                  </span>
                </button>
              {/each}
            {/if}
          </div>
          {#if nextCursor}
            <button class="btn subtle" onclick={() => loadTasks(true)} disabled={loading}>
              Load More
            </button>
          {/if}
        </section>

        <section class="tickets-section dependency-side">
          <div class="section-header">
            <h3>Selected Task Dependencies</h3>
            {#if selectedTaskLoading}<span>Loading</span>{/if}
          </div>
          <div class="task-list compact">
            {#each sortedPlanningTasks() as task (taskId(task))}
              <button
                class="task-row"
                class:active={taskId(task) === selectedTaskId}
                onclick={() => selectTask(taskId(task))}
              >
                <span class="task-title">{taskTitle(task)}</span>
                <span class="task-meta">
                  {taskDependencyList(task).length} deps / p{taskPriority(task)} / {taskStage(task)}
                </span>
              </button>
            {:else}
              <div class="empty-row">No tasks</div>
            {/each}
          </div>

          {#if selectedTask}
            <div class="dependency-detail">
              <div class="detail-title">
                <span>{taskTitle(selectedTask)}</span>
                <code>{selectedTask.id}</code>
              </div>
              <div class="stats-grid">
                <div><span>Blocked By</span><strong>{selectedDependencyEdges().length}</strong></div>
                <div><span>Blocking</span><strong>{tasksBlockingSelected().length}</strong></div>
                <div><span>Stage</span><strong>{selectedTask.stage || "-"}</strong></div>
                <div><span>Priority</span><strong>{selectedTask.priority ?? 0}</strong></div>
              </div>

              <div>
                <span class="subhead">Blocked By</span>
                {#if selectedDependencyEdges().length > 0}
                  <div class="pill-list">
                    {#each selectedDependencyEdges() as edge}
                      <button
                        class="pill"
                        onclick={() => edge.dependsOnId && selectTask(edge.dependsOnId)}
                        disabled={!edge.satisfied}
                      >
                        {edge.dependsOnTitle}
                      </button>
                    {/each}
                  </div>
                {:else}
                  <div class="empty-row compact">No blockers</div>
                {/if}
              </div>

              <div>
                <span class="subhead">Blocking</span>
                {#if tasksBlockingSelected().length > 0}
                  <div class="pill-list">
                    {#each tasksBlockingSelected() as task}
                      <button class="pill" onclick={() => selectTask(taskId(task))}>
                        {taskTitle(task)}
                      </button>
                    {/each}
                  </div>
                {:else}
                  <div class="empty-row compact">Not blocking visible tasks</div>
                {/if}
              </div>

              <div class="action-grid">
                <label class="field">
                  <span>Dependency</span>
                  <input bind:value={dependencyTaskId} placeholder="task-id" />
                </label>
                <button class="btn" onclick={addDependency} disabled={actionLoading || !dependencyTaskId.trim()}>
                  Add
                </button>
              </div>
            </div>
          {:else}
            <div class="empty-row">Select a task to inspect blockers.</div>
          {/if}
        </section>
      </div>
    {:else if panelView === "tasks"}
      <div class="tickets-grid">
        <section class="tickets-section browser-section">
          <div class="filter-grid">
            <label class="field">
              <span>Process</span>
              <select bind:value={filterPipeline}>
                <option value="">All</option>
                {#each pipelines as pipeline}
                  <option value={pipelineId(pipeline)}>{pipelineName(pipeline)}</option>
                {/each}
              </select>
            </label>
            <label class="field">
              <span>Stage</span>
              <input bind:value={filterStage} placeholder="todo" />
            </label>
            <label class="field small">
              <span>Limit</span>
              <input bind:value={taskLimit} inputmode="numeric" />
            </label>
            <button class="btn" onclick={() => loadTasks(false)} disabled={loading}>Apply</button>
          </div>

          <UniversalEntityView
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
            <button class="btn subtle" onclick={() => loadTasks(true)} disabled={loading}>
              Load More
            </button>
          {/if}
        </section>

        <section class="tickets-section">
          <div class="section-header">
            <h3>Task Detail</h3>
            {#if selectedTaskLoading}<span>Loading</span>{/if}
          </div>
          {#if selectedTask}
            <div class="detail-stack">
              <div class="detail-title">
                <span>{taskTitle(selectedTask)}</span>
                <code>{selectedTask.id}</code>
              </div>
              <div class="stats-grid">
                <div><span>Stage</span><strong>{selectedTask.stage || "-"}</strong></div>
                <div><span>Process</span><strong>{processNameById(selectedTask.pipeline_id)}</strong></div>
                <div><span>Priority</span><strong>{selectedTask.priority ?? 0}</strong></div>
                <div><span>Version</span><strong>{selectedTask.task_version ?? "-"}</strong></div>
              </div>
              {#if selectedRun}
                <div class="stats-grid">
                  <div><span>Run</span><strong>{runId(selectedRun)}</strong></div>
                  <div><span>Status</span><strong>{selectedRun.status || "-"}</strong></div>
                  <div><span>Agent</span><strong>{selectedRun.agent_id || "-"}</strong></div>
                  <div><span>Attempt</span><strong>{selectedRun.attempt ?? "-"}</strong></div>
                </div>
              {/if}
              {#if selectedTask.description}
                <p class="description">{selectedTask.description}</p>
              {/if}
              <div class="detail-columns">
                <div>
                  <span class="subhead">Assignments</span>
                  {#if activeTaskAssignments.length > 0}
                    <div class="pill-list">
                      {#each activeTaskAssignments as assignment}
                        <button
                          class="pill"
                          onclick={() => unassignTask(String(assignment.agent_id || ""))}
                          disabled={actionLoading}
                        >
                          {assignment.agent_id}
                        </button>
                      {/each}
                    </div>
                  {:else}
                    <span class="muted">None</span>
                  {/if}
                </div>
                <div>
                  <span class="subhead">Dependencies</span>
                  {#if taskDependencies.length > 0}
                    <div class="pill-list">
                      {#each taskDependencies as dep}
                        <span class="pill static">
                          {dep.depends_on_task_id || dep.task_id || dep}
                        </span>
                      {/each}
                    </div>
                  {:else}
                    <span class="muted">None</span>
                  {/if}
                </div>
              </div>
              {#if taskTransitions.length > 0}
                <div>
                  <span class="subhead">Transitions</span>
                  <div class="pill-list">
                    {#each taskTransitions as transition}
                      <span class="pill static">
                        {transition.trigger || "-"} -> {transition.to || transition.new_stage || "-"}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
              <pre>{jsonPreview(selectedTask.metadata)}</pre>
              <div class="action-grid">
                <label class="field">
                  <span>Assign Agent</span>
                  <input bind:value={assignAgent} placeholder="agent-id" />
                </label>
                <button class="btn" onclick={assignTask} disabled={actionLoading || !assignAgent.trim()}>
                  Assign
                </button>
                <label class="field">
                  <span>Dependency</span>
                  <input bind:value={dependencyTaskId} placeholder="task-id" />
                </label>
                <button class="btn" onclick={addDependency} disabled={actionLoading || !dependencyTaskId.trim()}>
                  Add
                </button>
                {#if canShowPanelView("runs")}
                  <button class="btn subtle" onclick={() => setPanelView("runs")} disabled={!selectedRunId}>
                    Run Controls
                  </button>
                {/if}
                {#if canShowPanelView("artifacts")}
                  <button class="btn subtle" onclick={openSelectedArtifacts}>
                    Artifacts
                  </button>
                {/if}
              </div>
            </div>
          {:else}
            <div class="empty-row">No task selected</div>
          {/if}
        </section>

        <section class="tickets-section full">
          <div class="section-header">
            <h3>Create Task</h3>
          </div>
          <div class="create-grid">
            <label class="field">
              <span>Process</span>
              <select bind:value={createTaskPipeline}>
                <option value="">Select</option>
                {#each pipelines as pipeline}
                  <option value={pipelineId(pipeline)}>{pipelineName(pipeline)}</option>
                {/each}
              </select>
            </label>
            <label class="field">
              <span>Title</span>
              <input bind:value={createTaskTitle} placeholder="Task title" />
            </label>
            <label class="field small">
              <span>Priority</span>
              <input bind:value={createTaskPriority} inputmode="numeric" />
            </label>
            <label class="field">
              <span>Assigned Agent</span>
              <input bind:value={createTaskAssignedAgent} placeholder="optional" />
            </label>
            <label class="field wide">
              <span>Description</span>
              <textarea bind:value={createTaskDescription} rows="3"></textarea>
            </label>
            <label class="field wide">
              <span>Dependencies</span>
              <input bind:value={createTaskDependencies} placeholder="task-a, task-b" />
            </label>
            <label class="field wide">
              <span>Metadata JSON</span>
              <textarea bind:value={createTaskMetadata} rows="4"></textarea>
            </label>
            <button
              class="btn"
              onclick={createTask}
              disabled={actionLoading ||
                !createTaskTitle.trim() ||
                !(createTaskPipeline.trim() || filterPipeline.trim() || selectedPipelineId.trim())}
            >
              Create Task
            </button>
          </div>
          <div class="bulk-block">
            <label class="field wide">
              <span>Bulk Tasks JSON</span>
              <textarea bind:value={bulkTasksJson} rows="8"></textarea>
            </label>
            <button class="btn subtle" onclick={bulkCreateTasks} disabled={actionLoading}>
              Bulk Create
            </button>
          </div>
        </section>
      </div>
    {:else if panelView === "pipelines"}
      <div class="tickets-grid">
        <section class="tickets-section browser-section">
          <UniversalEntityView
            title="Processes"
            description="Process definitions available on this NullTickets backend."
            records={pipelineRecords}
            columns={pipelineColumns}
            views={pipelineViews}
            defaultViewId="cards"
            {loading}
            error={error || null}
            actions={pipelineActions}
            emptyTitle="No processes"
            emptyDescription="Create a process definition to populate this view."
            onRefresh={refreshAll}
            onSelect={(record) => (selectedPipelineId = pipelineRecordId(record))}
            onOpen={(record) => (selectedPipelineId = pipelineRecordId(record))}
          />
        </section>

        <section class="tickets-section">
          <div class="section-header">
            <h3>Process Definition</h3>
          </div>
          {#if selectedPipeline}
            <div class="detail-stack">
              <div class="detail-title">
                <span>{pipelineName(selectedPipeline)}</span>
                <code>{pipelineId(selectedPipeline)}</code>
              </div>
              <pre>{jsonPreview(selectedPipeline.definition)}</pre>
            </div>
          {:else}
            <div class="empty-row">No process selected</div>
          {/if}
        </section>

        <section class="tickets-section full">
          <div class="section-header">
            <h3>Create Process</h3>
          </div>
          <div class="create-grid">
            <label class="field">
              <span>Name</span>
              <input bind:value={createPipelineName} placeholder="process name" />
            </label>
            <label class="field wide">
              <span>Definition JSON</span>
              <textarea bind:value={createPipelineDefinition} rows="12"></textarea>
            </label>
            <button class="btn" onclick={createPipeline} disabled={actionLoading || !createPipelineName.trim()}>
              Create Process
            </button>
          </div>
        </section>
      </div>
    {:else if panelView === "queue"}
      <div class="tickets-grid">
        <section class="tickets-section browser-section">
          <UniversalEntityView
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

        <section class="tickets-section">
          <div class="section-header">
            <h3>Claim</h3>
          </div>
          <div class="create-grid">
            <label class="field">
              <span>Agent</span>
              <input bind:value={claimAgent} placeholder="nullhub" />
            </label>
            <label class="field">
              <span>Role</span>
              <select bind:value={claimRole}>
                {#if queueRoles.length === 0}
                  <option value="coder">coder</option>
                {:else}
                  {#each queueRoles as role}
                    <option value={role.role || "coder"}>{role.role || "coder"}</option>
                  {/each}
                {/if}
              </select>
            </label>
            <label class="field">
              <span>Lease TTL ms</span>
              <input bind:value={claimTtl} inputmode="numeric" />
            </label>
            <button class="btn" onclick={claimNext} disabled={actionLoading || !claimRole.trim()}>
              Claim Next
            </button>
          </div>
          {#if claimed?.task}
            <div class="claimed-box">
              <span>{taskTitle(claimed.task)}</span>
              <code>{claimed.lease_id}</code>
            </div>
          {/if}
        </section>
      </div>
    {:else if panelView === "runs"}
      <div class="tickets-grid">
        <section class="tickets-section">
          <div class="section-header">
            <h3>Run</h3>
            {#if selectedRunId}<span>{selectedRunId}</span>{/if}
          </div>
          {#if selectedRun}
            <div class="detail-stack">
              <div class="stats-grid">
                <div><span>Status</span><strong>{selectedRun.status || "-"}</strong></div>
                <div><span>Task</span><strong>{selectedRun.task_id || selectedTaskId || "-"}</strong></div>
                <div><span>Agent</span><strong>{selectedRun.agent_id || "-"}</strong></div>
                <div><span>Role</span><strong>{selectedRun.agent_role || "-"}</strong></div>
                <div><span>Started</span><strong>{formatTime(selectedRun.started_at_ms)}</strong></div>
                <div><span>Ended</span><strong>{formatTime(selectedRun.ended_at_ms)}</strong></div>
              </div>
              <div class="create-grid">
                <label class="field">
                  <span>Lease ID</span>
                  <input bind:value={runLeaseId} placeholder="lease id from claim" />
                </label>
                <label class="field">
                  <span>Lease Token</span>
                  <input bind:value={runLeaseToken} placeholder="token from claim" />
                </label>
                <button class="btn" onclick={heartbeatLease} disabled={actionLoading || !runLeaseId.trim() || !runLeaseToken.trim()}>
                  Heartbeat
                </button>
              </div>
              {#if heartbeatExpiresAt}
                <span class="muted">Lease expires {formatTime(heartbeatExpiresAt)}</span>
              {/if}
              {#if taskTransitions.length > 0}
                <div>
                  <span class="subhead">Available Transitions</span>
                  <div class="pill-list">
                    {#each taskTransitions as transition}
                      <button
                        class="pill"
                        onclick={() => transitionRun(String(transition.trigger || ""))}
                        disabled={actionLoading || !runLeaseToken.trim()}
                      >
                        {transition.trigger || "-"} -> {transition.to || "-"}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
              <div class="create-grid">
                <label class="field">
                  <span>Trigger</span>
                  <input bind:value={transitionTrigger} placeholder="complete" />
                </label>
                <label class="field wide">
                  <span>Instructions</span>
                  <textarea bind:value={transitionInstructions} rows="3"></textarea>
                </label>
                <label class="field wide">
                  <span>Usage JSON</span>
                  <textarea bind:value={transitionUsage} rows="4"></textarea>
                </label>
                <button class="btn" onclick={() => transitionRun()} disabled={actionLoading || !transitionTrigger.trim() || !runLeaseToken.trim()}>
                  Transition
                </button>
              </div>
              <div class="create-grid">
                <label class="field wide">
                  <span>Fail Reason</span>
                  <textarea bind:value={failReason} rows="3"></textarea>
                </label>
                <label class="field wide">
                  <span>Fail Usage JSON</span>
                  <textarea bind:value={failUsage} rows="4"></textarea>
                </label>
                <button class="btn danger" onclick={failRun} disabled={actionLoading || !failReason.trim() || !runLeaseToken.trim()}>
                  Fail Run
                </button>
              </div>
            </div>
          {:else}
            <div class="empty-row">Select or claim a task with a run.</div>
          {/if}
        </section>

        <section class="tickets-section browser-section">
          <div class="filter-grid">
            <label class="field small">
              <span>Limit</span>
              <input bind:value={runEventsLimit} inputmode="numeric" />
            </label>
            <button class="btn" onclick={() => loadRunEvents(false)} disabled={loading || !selectedRunId}>
              Load Events
            </button>
          </div>
          <UniversalEntityView
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
            <button class="btn subtle" onclick={() => loadRunEvents(true)} disabled={loading}>
              Load More
            </button>
          {/if}
          <div class="create-grid">
            <label class="field">
              <span>Kind</span>
              <input bind:value={eventKind} placeholder="note" />
            </label>
            <label class="field wide">
              <span>Data JSON</span>
              <textarea bind:value={eventData} rows="5"></textarea>
            </label>
            <button class="btn" onclick={addRunEvent} disabled={actionLoading || !selectedRunId || !eventKind.trim() || !runLeaseToken.trim()}>
              Add Event
            </button>
          </div>
        </section>
      </div>
    {:else}
      <div class="tickets-grid">
        <section class="tickets-section browser-section">
          <div class="filter-grid">
            <div class="field wide">
              <span>Scope</span>
              <div class="scope-buttons">
                <button
                  class:active={artifactScope === "selected"}
                  onclick={() => setArtifactScope("selected")}
                  disabled={loading}
                >
                  Selected
                </button>
                <button
                  class:active={artifactScope === "custom"}
                  onclick={() => setArtifactScope("custom")}
                  disabled={loading}
                >
                  Custom
                </button>
                <button
                  class:active={artifactScope === "all"}
                  onclick={() => setArtifactScope("all")}
                  disabled={loading}
                >
                  All
                </button>
              </div>
            </div>
            {#if artifactScope === "custom"}
              <label class="field">
                <span>Task ID</span>
                <input bind:value={artifactTaskFilter} placeholder="optional" />
              </label>
              <label class="field">
                <span>Run ID</span>
                <input bind:value={artifactRunFilter} placeholder="optional" />
              </label>
            {/if}
            <label class="field small">
              <span>Limit</span>
              <input bind:value={artifactLimit} inputmode="numeric" />
            </label>
            <button class="btn" onclick={() => loadArtifacts(false)} disabled={loading}>
              Load Artifacts
            </button>
          </div>
          <UniversalEntityView
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
            <button class="btn subtle" onclick={() => loadArtifacts(true)} disabled={loading}>
              Load More
            </button>
          {/if}
        </section>

        <section class="tickets-section">
          <div class="section-header">
            <h3>Create Artifact</h3>
            <span>{artifactScopeLabel()}</span>
          </div>
          <div class="create-grid">
            <label class="field">
              <span>Kind</span>
              <input bind:value={artifactKind} placeholder="file" />
            </label>
            <label class="field wide">
              <span>URI</span>
              <input bind:value={artifactUri} placeholder="file:///tmp/result.txt" />
            </label>
            <label class="field">
              <span>SHA-256</span>
              <input bind:value={artifactSha256} placeholder="optional" />
            </label>
            <label class="field">
              <span>Size Bytes</span>
              <input bind:value={artifactSize} inputmode="numeric" />
            </label>
            <label class="field wide">
              <span>Meta JSON</span>
              <textarea bind:value={artifactMeta} rows="6"></textarea>
            </label>
            <button class="btn" onclick={createArtifact} disabled={actionLoading || !artifactKind.trim() || !artifactUri.trim()}>
              Create Artifact
            </button>
          </div>
        </section>
      </div>
    {/if}
  {/if}
</div>

<style>
  .tickets-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .tickets-header,
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .tickets-header {
    flex-wrap: wrap;
  }
  .tickets-heading {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: min(100%, 18rem);
    margin-right: auto;
  }
  .tickets-heading h2 {
    margin: 0;
    color: var(--accent);
    font-size: 1.25rem;
    line-height: 1.2;
    letter-spacing: 0;
  }
  .tickets-heading p {
    max-width: 46rem;
    margin: 0;
    color: var(--fg-dim);
    font-size: 0.875rem;
    line-height: 1.45;
  }
  .tickets-tabs {
    display: inline-flex;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    border-radius: 2px;
    overflow: hidden;
  }
  .tickets-tabs button {
    min-width: 120px;
    padding: 0.65rem 1rem;
    border: 0;
    border-right: 1px solid var(--border);
    background: transparent;
    color: var(--fg-dim);
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0;
    font-weight: 700;
    font-size: 0.75rem;
  }
  .tickets-tabs button:last-child {
    border-right: 0;
  }
  .tickets-tabs button.active {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    text-shadow: var(--text-glow);
  }
  .tickets-grid {
    display: grid;
    grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
    gap: 1rem;
  }
  .planner-grid,
  .dependency-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
    gap: 1rem;
  }
  .tickets-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-surface);
  }
  .tickets-section.full {
    grid-column: 1 / -1;
  }
  .tickets-section.browser-section {
    border: 0;
    background: transparent;
    padding: 0;
  }
  .planner-main,
  .dependency-main {
    min-height: 520px;
  }
  .planner-side,
  .dependency-side {
    align-self: start;
  }
  .section-header h3 {
    margin: 0;
    color: var(--accent);
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0;
  }
  .section-header span {
    color: var(--fg-dim);
    font-size: 0.75rem;
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }
  .section-header.inner {
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
  .insight-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 0.5rem;
  }
  .insight-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.7rem;
    border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--bg) 72%, transparent);
  }
  .insight-card span {
    color: var(--fg-dim);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0;
    font-weight: 700;
  }
  .insight-card strong {
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 1rem;
    overflow-wrap: anywhere;
  }
  .filter-grid,
  .action-grid,
  .create-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.75rem;
    align-items: end;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .field.small {
    min-width: 80px;
  }
  .field.wide {
    grid-column: 1 / -1;
  }
  .field span,
  .subhead {
    color: var(--accent-dim);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0;
    font-weight: 700;
  }
  .field input,
  .field select,
  .field textarea {
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 2px;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 0.8rem;
  }
  .field textarea {
    resize: vertical;
    min-height: 84px;
  }
  .scope-buttons {
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    border: 1px solid var(--border);
    border-radius: 2px;
    overflow: hidden;
  }
  .scope-buttons button {
    min-width: 92px;
    padding: 0.55rem 0.75rem;
    border: 0;
    border-right: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg-dim);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0;
  }
  .scope-buttons button:last-child {
    border-right: 0;
  }
  .scope-buttons button.active {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .scope-buttons button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .field input:focus,
  .field select:focus,
  .field textarea:focus {
    border-color: var(--accent);
  }
  .btn {
    min-height: 38px;
    padding: 0.5rem 0.85rem;
    border: 1px solid var(--accent-dim);
    border-radius: 2px;
    background: var(--bg-surface);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--bg-hover);
  }
  .btn.subtle {
    color: var(--fg);
    border-color: var(--border);
  }
  .btn.danger {
    color: var(--error);
    border-color: color-mix(in srgb, var(--error) 50%, transparent);
  }
  .bulk-block {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
  .task-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 520px;
    overflow: auto;
  }
  .task-list.compact {
    max-height: 320px;
  }
  .task-row {
    display: grid;
    width: 100%;
    gap: 0.25rem;
    padding: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    color: var(--fg);
    text-align: left;
    cursor: pointer;
  }
  .task-row.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .task-title {
    color: var(--fg);
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .task-meta,
  .muted {
    color: var(--fg-dim);
    font-size: 0.75rem;
    font-family: var(--font-mono);
  }
  .detail-stack {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }
  .detail-title {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .detail-title span {
    color: var(--fg);
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  code {
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 0.5rem;
  }
  .stats-grid div {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.65rem;
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    border-radius: 2px;
  }
  .stats-grid span {
    color: var(--fg-dim);
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0;
  }
  .stats-grid strong {
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.85rem;
  }
  .description {
    margin: 0;
    color: var(--fg);
    white-space: pre-wrap;
  }
  .detail-columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
  }
  .pill-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  .pill {
    padding: 0.35rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 2px;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 0.75rem;
  }
  button.pill {
    cursor: pointer;
  }
  .pill.static {
    cursor: default;
  }
  .process-plan-list,
  .planner-task-list,
  .dependency-list,
  .dependency-detail,
  .selected-plan {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.75rem;
  }
  .dependency-list {
    max-height: 620px;
    overflow: auto;
  }
  .process-plan {
    display: grid;
    gap: 0.75rem;
    padding: 0.85rem;
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
  }
  .process-plan-header {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .process-plan-header > div:first-child {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }
  .stage-strip {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem;
  }
  .stage-strip span {
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }
  .planner-task {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.65rem;
    width: 100%;
    padding: 0.65rem;
    border: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
    border-radius: 2px;
    background: var(--bg-surface);
    color: var(--fg);
    text-align: left;
    cursor: pointer;
  }
  .planner-task.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .planner-priority {
    min-width: 2.25rem;
    padding: 0.2rem 0.35rem;
    border: 1px solid color-mix(in srgb, var(--accent-dim) 60%, transparent);
    border-radius: 2px;
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    font-weight: 700;
    text-align: center;
  }
  .dependency-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 0.75rem;
    align-items: center;
    width: 100%;
    padding: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    color: var(--fg);
    text-align: left;
    cursor: pointer;
  }
  .dependency-row.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .dependency-node {
    display: grid;
    min-width: 0;
    gap: 0.2rem;
  }
  .dependency-node strong {
    overflow-wrap: anywhere;
  }
  .dependency-node small,
  .dependency-arrow {
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }
  .dependency-arrow {
    text-transform: uppercase;
    letter-spacing: 0;
    white-space: nowrap;
  }
  .empty-row.compact {
    margin-top: 0.5rem;
    padding: 0.6rem;
  }
  pre {
    max-height: 280px;
    overflow: auto;
    margin: 0;
    padding: 0.85rem;
    border: 1px solid var(--border);
    border-radius: 2px;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .claimed-box,
  .empty-row,
  .empty-state,
  .error-banner,
  .message-banner {
    padding: 0.85rem;
    border: 1px solid var(--border);
    border-radius: 2px;
    background: var(--bg-surface);
    color: var(--fg-dim);
  }
  .error-banner {
    color: var(--error);
    border-color: color-mix(in srgb, var(--error) 50%, transparent);
  }
  .message-banner {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  }
  .claimed-box {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    color: var(--fg);
  }
  @media (max-width: 900px) {
    .tickets-grid,
    .planner-grid,
    .dependency-grid {
      grid-template-columns: 1fr;
    }
    .tickets-tabs {
      width: 100%;
    }
    .tickets-tabs button {
      flex: 1;
      min-width: 0;
    }
    .process-plan-header,
    .dependency-row {
      grid-template-columns: 1fr;
    }
    .process-plan-header {
      flex-direction: column;
    }
    .stage-strip {
      justify-content: flex-start;
    }
    .dependency-arrow {
      white-space: normal;
    }
  }
</style>
