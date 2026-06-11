import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import TodayWorkspace from "./TodayWorkspace.svelte";

async function setSelectValue(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const apiMock = vi.hoisted(() => ({
  getStatus: vi.fn(),
  nullTicketsPipelines: vi.fn(),
  nullTicketsTasks: vi.fn(),
  nullTicketsCreateTask: vi.fn(),
}));

const backendMock = vi.hoisted(() => ({
  getSelectedTicketsInstance: vi.fn(() => "default"),
  setSelectedTicketsInstance: vi.fn(),
}));

const pollMock = vi.hoisted(() => ({
  pollWhileVisible: vi.fn(() => vi.fn()),
}));

vi.mock("$lib/api/client", () => ({ api: apiMock }));
vi.mock("$lib/nullstack/backendSelection", () => backendMock);
vi.mock("$lib/poll", () => pollMock);

afterEach(() => {
  vi.clearAllMocks();
});

function makeStatus() {
  return {
    instances: {
      nulltickets: {
        default: { status: "running" },
      },
      nullclaw: {
        writer: { status: "running" },
        reviewer: { status: "idle" },
      },
    },
  };
}

test("shows a loading shell before data resolves", async () => {
  let resolveStatus: ((value: ReturnType<typeof makeStatus>) => void) | null = null;
  apiMock.getStatus.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
  );
  apiMock.nullTicketsPipelines.mockResolvedValue([]);
  apiMock.nullTicketsTasks.mockResolvedValue({ items: [], has_more: false });

  const screen = await render(TodayWorkspace);

  await expect.element(screen.getByText("Loading Today tasks…")).toBeVisible();
  resolveStatus?.(makeStatus());
  await expect.element(screen.getByRole("heading", { name: "Today" })).toBeVisible();
});

test("shows empty and error states", async () => {
  apiMock.getStatus.mockResolvedValue(makeStatus());
  apiMock.nullTicketsPipelines.mockResolvedValue([]);
  apiMock.nullTicketsTasks.mockResolvedValue({ items: [], has_more: false });

  const emptyScreen = await render(TodayWorkspace);
  await expect.element(emptyScreen.getByText("No tasks updated today.")).toBeVisible();
  await expect.element(emptyScreen.getByText("No other tasks landed in this week bucket yet.")).toBeVisible();

  vi.clearAllMocks();
  apiMock.getStatus.mockRejectedValue(new Error("NullTickets backend unreachable."));
  const errorScreen = await render(TodayWorkspace);
  await expect.element(errorScreen.getByText("NullTickets backend unreachable.")).toBeVisible();
});

test("renders populated groups and creates tasks through the form", async () => {
  apiMock.getStatus.mockResolvedValue(makeStatus());
  apiMock.nullTicketsPipelines.mockResolvedValue([
    { id: "delivery", name: "Delivery" },
    { id: "evidence", name: "Evidence" },
  ]);
  apiMock.nullTicketsTasks.mockResolvedValue({
    items: [
      {
        id: "task-today",
        title: "Prepare launch note",
        description: "Draft the customer-facing summary.",
        pipeline_id: "delivery",
        stage: "in_progress",
        priority: 3,
        updated_at_ms: Date.now(),
        assignments: [{ agent_name: "Writer agent" }],
      },
      {
        id: "task-week",
        title: "Review evidence pack",
        pipeline_id: "evidence",
        stage: "queued",
        priority: 1,
        updated_at_ms: Date.now() - 2 * 24 * 60 * 60 * 1000,
      },
    ],
    has_more: false,
  });
  apiMock.nullTicketsCreateTask.mockResolvedValue({});

  const screen = await render(TodayWorkspace);

  await expect.element(screen.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "This week" })).toBeVisible();
  await expect.element(screen.getByText("Prepare launch note")).toBeVisible();
  await expect.element(screen.getByText("Review evidence pack")).toBeVisible();
  await expect.element(screen.getByText("Writer agent")).toBeVisible();

  const pipeline = screen.container.querySelector<HTMLSelectElement>("#quick-add-pipeline");
  const delegate = screen.container.querySelector<HTMLSelectElement>("#delegate-dropdown");
  expect(pipeline).not.toBeNull();
  expect(delegate).not.toBeNull();
  await setSelectValue(pipeline as HTMLSelectElement, "evidence");
  await setSelectValue(delegate as HTMLSelectElement, "writer");

  await screen.getByLabelText("Task title").fill("Ship the follow-up");
  await screen.getByLabelText("Description").fill("Hand off to the review queue.");
  await screen.getByLabelText("Priority").fill("2");
  await screen.getByRole("button", { name: "Add task" }).click();

  expect(apiMock.nullTicketsCreateTask).toHaveBeenCalledWith("nulltickets", "default", {
    pipeline_id: "evidence",
    title: "Ship the follow-up",
    description: "Hand off to the review queue.",
    priority: 2,
    metadata: {},
    assigned_agent_id: "writer",
    assigned_by: "nullhub",
  });
});
