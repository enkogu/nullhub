import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import QuickAddTask from "./QuickAddTask.svelte";

async function setSelectValue(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("submits a new task with the selected pipeline and delegate", async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const screen = await render(QuickAddTask, {
    pipelines: [
      { value: "delivery", label: "Delivery" },
      { value: "evidence", label: "Evidence" },
    ],
    agents: [
      { value: "writer", label: "Writer agent", status: "running" },
      { value: "ops", label: "Ops agent", status: "idle" },
    ],
    onSubmit,
  });

  const pipeline = screen.container.querySelector<HTMLSelectElement>("#quick-add-pipeline");
  const delegate = screen.container.querySelector<HTMLSelectElement>("#delegate-dropdown");
  expect(pipeline).not.toBeNull();
  expect(delegate).not.toBeNull();
  await setSelectValue(pipeline as HTMLSelectElement, "evidence");
  await setSelectValue(delegate as HTMLSelectElement, "writer");

  await screen.getByLabelText("Task title").fill("Draft the launch note");
  await screen.getByLabelText("Description").fill("Ready for review");
  await screen.getByLabelText("Priority").fill("3");
  await screen.getByRole("button", { name: "Add task" }).click();

  expect(onSubmit).toHaveBeenCalledWith({
    pipelineId: "evidence",
    title: "Draft the launch note",
    description: "Ready for review",
    priority: 3,
    delegateAgentId: "writer",
  });
});
