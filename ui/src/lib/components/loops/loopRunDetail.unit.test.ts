import { describe, expect, test } from "vitest";
import type { LoopRunDetailData, LoopRunDetailEntry } from "./loopRunDetail";
import {
  detailWorkerInstance,
  detailHref,
  extractCheckOutput,
  extractJudgeDecisions,
  loadLoopAgentResult,
  summarizeCost,
} from "./loopRunDetail";

const entry: LoopRunDetailEntry = {
  task: {
    id: "task-loop-1",
    pipeline_id: "support-triage",
    stage: "done",
    title: "Triage support inbox",
    created_at_ms: 1_780_000_000_000,
  },
  run: {
    id: "loop-run-1",
    task_id: "task-loop-1",
    status: "completed",
    attempt: 2,
    agent_id: "nullclaw-Athena",
    started_at_ms: 1_780_000_000_000,
    ended_at_ms: 1_780_000_180_000,
  },
  pipeline: {
    id: "support-triage",
    name: "Support Triage",
  },
};

const detail: LoopRunDetailData = {
  events: [
    {
      id: 1,
      run_id: "loop-run-1",
      ts_ms: 1_780_000_010_000,
      kind: "check_completed",
      data: {
        check_output: "All requests have owners.",
        usage: { prompt_tokens: 900, completion_tokens: 310, total_tokens: 1210, cost_usd: 0.0042 },
      },
    },
    {
      id: 2,
      run_id: "loop-run-1",
      ts_ms: 1_780_000_020_000,
      kind: "judge_decision",
      data: {
        decision: "approved",
        reason: "The exit condition is satisfied.",
        judge: "Iris",
      },
    },
  ],
  artifacts: [
    {
      id: "artifact-1",
      task_id: "task-loop-1",
      run_id: "loop-run-1",
      kind: "report",
      uri: "artifact://loop-run-1/report.md",
      size_bytes: 2048,
      meta: { usage: { requests: 1, model: "fake/local" } },
    },
  ],
};

describe("loop run detail helpers", () => {
  test("builds canonical detail href with task and instance context", () => {
    expect(detailHref(entry, "tickets")).toBe("/work/runs/loop-run-1?task_id=task-loop-1&tickets_instance=tickets");
    expect(detailHref(entry, "tickets", "ops")).toBe("/work/runs/loop-run-1?task_id=task-loop-1&tickets_instance=tickets&space=ops");
  });

  test("extracts check output from run events", () => {
    expect(extractCheckOutput(detail, entry)).toMatchObject({
      content: "All requests have owners.",
      language: "text",
      source: "check_completed",
    });
  });

  test("keeps event kind authoritative when payload kind is metadata", () => {
    expect(
      extractCheckOutput(
        {
          events: [
            {
              id: 3,
              run_id: "loop-run-1",
              ts_ms: 1_780_000_030_000,
              kind: "check_completed",
              data: { kind: "markdown", check_output: "Payload kind should not hide this output." },
            },
          ],
          artifacts: [],
        },
        entry,
      ),
    ).toMatchObject({
      content: "Payload kind should not hide this output.",
      source: "check_completed",
    });
  });

  test("keeps run-scoped check output ahead of heuristic agent history", () => {
    expect(
      extractCheckOutput(detail, entry, {
        instanceName: "Athena",
        sessionId: "webhook:local-nullboiler-worker",
        content: "Historical assistant answer from the same task.",
      }),
    ).toMatchObject({
      content: "All requests have owners.",
      source: "check_completed",
    });
  });

  test("matches bare agent IDs against available NullClaw instances", () => {
    const bareEntry = {
      ...entry,
      run: entry.run ? { ...entry.run, agent_id: "Athena" } : undefined,
    };
    expect(detailWorkerInstance([], bareEntry, "claw", ["Athena", "Iris"])).toBe("Athena");
    expect(detailWorkerInstance([], bareEntry, "claw", ["Iris"])).toBe("claw");
  });

  test("always checks the known worker fallback history session", async () => {
    const requestedSessions: string[] = [];
    const result = await loadLoopAgentResult(
      {
        async getHistory(_component, _instance, params) {
          if (!params?.sessionId) {
            return {
              sessions: ["one", "two", "three", "four", "five"].map((sessionId) => ({ session_id: sessionId })),
            };
          }
          requestedSessions.push(params.sessionId);
          if (params.sessionId === "webhook:local-nullboiler-worker") {
            return {
              messages: [
                { role: "user", content: "Run loop-run-1 for task task-loop-1 until complete." },
                { role: "assistant", content: "Fallback worker session result." },
              ],
            };
          }
          return { messages: [] };
        },
      },
      entry,
      [],
      "Athena",
      ["Athena"],
    );

    expect(requestedSessions).toEqual(["one", "two", "three", "four", "webhook:local-nullboiler-worker"]);
    expect(result).toMatchObject({
      sessionId: "webhook:local-nullboiler-worker",
      content: "Fallback worker session result.",
    });
  });

  test("does not let the fallback history session displace the fourth listed session", async () => {
    const result = await loadLoopAgentResult(
      {
        async getHistory(_component, _instance, params) {
          if (!params?.sessionId) {
            return {
              sessions: ["one", "two", "three", "four", "five"].map((sessionId) => ({ session_id: sessionId })),
            };
          }
          if (params.sessionId === "four") {
            return {
              messages: [
                { role: "user", content: "Run loop-run-1 for task task-loop-1 until complete." },
                { role: "assistant", content: "Fourth listed session result." },
              ],
            };
          }
          if (params.sessionId === "webhook:local-nullboiler-worker") {
            return {
              messages: [
                { role: "user", content: "Run loop-run-1 for task task-loop-1 until complete." },
                { role: "assistant", content: "Fallback worker session result." },
              ],
            };
          }
          return { messages: [] };
        },
      },
      entry,
      [],
      "Athena",
      ["Athena"],
    );

    expect(result).toMatchObject({
      sessionId: "four",
      content: "Fourth listed session result.",
    });
  });

  test("falls back to exact task id when history omits the run id", async () => {
    const result = await loadLoopAgentResult(
      {
        async getHistory(_component, _instance, params) {
          if (!params?.sessionId) {
            return { sessions: [{ session_id: "task-only" }] };
          }
          return {
            messages: [
              { role: "user", content: "Work on task task-loop-1 until its exit condition passes." },
              { role: "assistant", content: "Task-scoped worker result." },
            ],
          };
        },
      },
      entry,
      [],
      "Athena",
      ["Athena"],
    );

    expect(result).toMatchObject({
      sessionId: "task-only",
      content: "Task-scoped worker result.",
    });
  });

  test("prefers exact run id history over an earlier task-only session", async () => {
    const result = await loadLoopAgentResult(
      {
        async getHistory(_component, _instance, params) {
          if (!params?.sessionId) {
            return { sessions: [{ session_id: "task-only" }, { session_id: "run-specific" }] };
          }
          if (params.sessionId === "task-only") {
            return {
              messages: [
                { role: "user", content: "Work on task task-loop-1 until its exit condition passes." },
                { role: "assistant", content: "Task-only result." },
              ],
            };
          }
          return {
            messages: [
              { role: "user", content: "Run loop-run-1 for task task-loop-1 until complete." },
              { role: "assistant", content: "Run-specific result." },
            ],
          };
        },
      },
      entry,
      [],
      "Athena",
      ["Athena"],
    );

    expect(result).toMatchObject({
      sessionId: "run-specific",
      content: "Run-specific result.",
    });
  });

  test("does not match agent history by run id prefix", async () => {
    const result = await loadLoopAgentResult(
      {
        async getHistory(_component, _instance, params) {
          if (!params?.sessionId) {
            return { sessions: [{ session_id: "webhook:local-nullboiler-worker" }] };
          }
          return {
            messages: [
              { role: "user", content: "Run loop-run-10 for task task-loop-1 until complete." },
              { role: "assistant", content: "Wrong prefixed run result." },
            ],
          };
        },
      },
      entry,
      [],
      "Athena",
      ["Athena"],
    );

    expect(result).toBeNull();
  });

  test("extracts judge decisions and summarizes usage cost", () => {
    expect(extractJudgeDecisions(detail)).toEqual([
      expect.objectContaining({
        verdict: "approved",
        reason: "The exit condition is satisfied.",
        actor: "Iris",
      }),
    ]);
    expect(summarizeCost(detail, entry)).toMatchObject({
      available: true,
      promptTokens: 900,
      completionTokens: 310,
      totalTokens: 1210,
      requests: 1,
      costUsd: 0.0042,
      model: "fake/local",
    });
  });

  test("summarizes usage_json cost fields", () => {
    expect(
      summarizeCost({
        events: [
          {
            id: 3,
            run_id: "loop-run-1",
            ts_ms: 1_780_000_030_000,
            kind: "check_completed",
            data: {
              usage_json: JSON.stringify({
                prompt_tokens: 100,
                completion_tokens: 40,
                total_tokens: 140,
                total_cost_usd: 0.0014,
                requests: 2,
                model: "fixture/model",
              }),
            },
          },
        ],
        artifacts: [],
      }),
    ).toMatchObject({
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140,
      requests: 2,
      costUsd: 0.0014,
      model: "fixture/model",
    });
  });
});
