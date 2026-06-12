export type LoopRunsFilter = "all" | "active" | "waiting" | "attention" | "completed";

type LoopRunsRouteOptions = {
  filter?: LoopRunsFilter;
  loop?: string;
};

function withLoopRunParams(options: LoopRunsRouteOptions = {}): string {
  const params = new URLSearchParams();
  if (options.filter) params.set("filter", options.filter);
  if (options.loop) params.set("loop", options.loop);
  const search = params.toString();
  return search ? `/work/loops/runs?${search}` : "/work/loops/runs";
}

export const loopRoutes = {
  definitions: "/orders/loops",
  library: "/orders/loops/library",
  marketplace: "/market/loops",
  runs: withLoopRunParams,
  teamAgents: "/team/agents",
  teamInstances: "/team/instances",
} as const;
