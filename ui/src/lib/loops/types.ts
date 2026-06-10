export type LoopPipeline = {
  id: string;
  name: string;
  definition?: any;
  created_at_ms?: number;
};

export type LoopTask = {
  id: string;
  pipeline_id: string;
  stage: string;
  title: string;
  description?: string;
  priority?: number;
  metadata?: Record<string, any>;
  latest_run?: LoopRun | null;
  updated_at_ms?: number;
  created_at_ms?: number;
  dead_letter_stage?: string | null;
  dead_letter_reason?: string | null;
};

export type LoopRun = {
  id: string;
  task_id: string;
  attempt?: number;
  status: string;
  agent_id?: string;
  agent_role?: string;
  started_at_ms?: number | null;
  ended_at_ms?: number | null;
  error_text?: string | null;
};

export type LoopRunEvent = {
  id: number;
  run_id: string;
  ts_ms: number;
  kind: string;
  data?: Record<string, any>;
};

export type LoopArtifact = {
  id: string;
  task_id?: string | null;
  run_id?: string | null;
  created_at_ms?: number;
  kind: string;
  uri: string;
  sha256?: string | null;
  size_bytes?: number | null;
  meta?: Record<string, any>;
};

export type LoopRunRow = {
  task: LoopTask;
  run: LoopRun;
  pipeline?: LoopPipeline;
};

export type LoopMeta = {
  slug?: string;
  version?: number;
  source?: string;
  category?: string;
  machine?: string;
  goal?: string;
  exit_condition?: string;
  max_iterations?: number;
};

export type LoopSummary = {
  pipeline: LoopPipeline;
  meta: LoopMeta | null;
  waiting: number;
  active: number;
  attention: number;
  done: number;
  lastRow: LoopRunRow | null;
};

export type RunBucket = "active" | "attention" | "completed" | "other";
