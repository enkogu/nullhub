import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import LoopRunCheckOutput from "./LoopRunCheckOutput.svelte";
import LoopRunDetailPanel from "./LoopRunDetailPanel.svelte";
import type { LoopRunDetailData, LoopRunDetailEntry } from "./loopRunDetail";

const entry: LoopRunDetailEntry = {
  task: {
    id: "task-loop-1",
    pipeline_id: "support-triage",
    stage: "done",
    title: "Triage support inbox",
    description: "Review incoming support requests.",
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
      kind: "claimed",
      data: { worker_id: "nullclaw-Athena" },
    },
    {
      id: 2,
      run_id: "loop-run-1",
      ts_ms: 1_780_000_020_000,
      kind: "check_completed",
      data: { check_output: "All requests have owners.", usage: { total_tokens: 1210, cost_usd: 0.0042 } },
    },
    {
      id: 3,
      run_id: "loop-run-1",
      ts_ms: 1_780_000_030_000,
      kind: "judge_decision",
      data: { decision: "approved", reason: "The exit condition is satisfied.", judge: "Iris" },
    },
  ],
  artifacts: [
    {
      id: "artifact-1",
      task_id: "task-loop-1",
      run_id: "loop-run-1",
      created_at_ms: 1_780_000_040_000,
      kind: "report",
      uri: "artifact://loop-run-1/report.md",
      size_bytes: 2048,
      meta: {},
    },
  ],
};

test("renders loop run detail sections", async () => {
  const screen = await render(LoopRunDetailPanel, { props: { entry, detail } });
  const attemptSummary = screen.getByRole("region", { name: "Attempt summary" });
  const checkOutput = screen.getByRole("region", { name: "Check output" });
  const judgeDecisions = screen.getByRole("region", { name: "Judge decisions" });
  const costSummary = screen.getByRole("region", { name: "Cost summary" });

  await expect.element(screen.getByRole("heading", { name: "Triage support inbox" })).toBeVisible();
  await expect.element(attemptSummary.getByText("Attempt", { exact: true })).toBeVisible();
  await expect.element(checkOutput.getByText("All requests have owners.", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Timeline")).toBeVisible();
  await expect.element(screen.getByText("Judge decisions")).toBeVisible();
  await expect.element(judgeDecisions.getByText("The exit condition is satisfied.")).toBeVisible();
  await expect.element(costSummary.getByText("1,210")).toBeVisible();
  await expect.element(screen.getByText("artifact://loop-run-1/report.md · 2 KB")).toBeVisible();
});

test("renders check output loading and empty states", async () => {
  const loading = await render(LoopRunCheckOutput, { props: { loading: true } });
  expect(loading.container.querySelector('[aria-label="Loading code block"]')).not.toBeNull();

  const empty = await render(LoopRunCheckOutput, { props: { detail: { events: [], artifacts: [] } } });
  await expect.element(empty.getByText("No check output")).toBeVisible();
});

test("keeps recorded check output visible when optional history fails", async () => {
  const screen = await render(LoopRunCheckOutput, {
    props: {
      detail,
      entry,
      error: "History unavailable.",
    },
  });

  await expect.element(screen.getByRole("region", { name: "Check output" }).getByText("All requests have owners.", { exact: true })).toBeVisible();
  expect(screen.container.textContent).not.toContain("Check output unavailable");
});
