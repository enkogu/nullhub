import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";
import TaskRow from "./TaskRow.svelte";

test("renders task row details and delegates", async () => {
  const screen = await render(TaskRow, {
    task: {
      id: "task-7",
      title: "Prepare launch note",
      description: "Draft the customer-facing summary and handoff notes.",
      pipeline_id: "delivery",
      stage: "in_progress",
      priority: 3,
      updated_at_ms: Date.now(),
      assignments: [{ agent_name: "Writer agent" }],
    },
    pipelineName: "Delivery",
    bucket: "Today",
  });

  await expect.element(screen.getByRole("heading", { name: "Prepare launch note" })).toBeVisible();
  await expect.element(screen.getByText("Today")).toBeVisible();
  await expect.element(screen.getByText("Delivery")).toBeVisible();
  await expect.element(screen.getByText("Writer agent")).toBeVisible();
});
