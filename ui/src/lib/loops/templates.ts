import type { LoopMeta, LoopPipeline } from "./types";

export type LoopTemplate = {
  slug: string;
  name: string;
  category: string;
  machine: string;
  tagline: string;
  goal: string;
  exitCondition: string;
  checkInstruction: string;
  maxIterations: number;
  starter: {
    title: string;
    description: string;
    priority: number;
  };
};

// The default local worker claims the "coder" role, so every template keeps
// its working state claimable by it. The semantic machine lives in loop meta.
const claimableAgentRole = "coder";

export function templateDefinition(template: LoopTemplate): Record<string, any> {
  return {
    initial: "todo",
    states: {
      todo: { agent_role: claimableAgentRole, description: "Ready for the agent" },
      done: { terminal: true, description: "Exit condition met" },
    },
    transitions: [
      { from: "todo", to: "done", trigger: "complete", instructions: template.checkInstruction },
    ],
    loop: {
      slug: template.slug,
      version: 1,
      source: "builtin",
      category: template.category,
      machine: template.machine,
      goal: template.goal,
      exit_condition: template.exitCondition,
      max_iterations: template.maxIterations,
    } satisfies LoopMeta,
  };
}

export function customLoopDefinition(goal: string): Record<string, any> {
  return {
    initial: "todo",
    states: {
      todo: { agent_role: claimableAgentRole, description: "Ready for the agent" },
      done: { terminal: true, description: "Exit condition met" },
    },
    transitions: [{ from: "todo", to: "done", trigger: "complete" }],
    loop: {
      version: 1,
      source: "custom",
      goal: goal || undefined,
    } satisfies LoopMeta,
  };
}

export function loopMeta(pipeline: LoopPipeline | undefined): LoopMeta | null {
  const meta = pipeline?.definition?.loop;
  return meta && typeof meta === "object" ? (meta as LoopMeta) : null;
}

export function installedTemplateSlugs(pipelines: LoopPipeline[]): Set<string> {
  const slugs = new Set<string>();
  for (const pipeline of pipelines) {
    const slug = loopMeta(pipeline)?.slug;
    if (slug) slugs.add(slug);
    if (pipeline.name) slugs.add(pipeline.name);
  }
  return slugs;
}
