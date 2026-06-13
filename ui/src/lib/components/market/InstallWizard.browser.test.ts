import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import InstallWizard from "./InstallWizard.svelte";
import { marketPackages } from "./fixtures";

const spaces = [
  { id: "ops", name: "Operations", kind: "workspace", stage: "active" },
  { id: "lab", name: "Lab", kind: "workspace", stage: "active" },
];

const agents = [
  { id: "runtime", name: "runtime", role: "Runtime operator", status: "running" },
  { id: "loop-owner", name: "loop-owner", role: "Loop operator", status: "running" },
  { id: "tool-owner", name: "tool-owner", role: "Tool maintainer", status: "stopped" },
];

test("walks the five-step install wizard and stages a package payload", async () => {
  const onEnact = vi.fn();
  const screen = await render(InstallWizard, {
    pkg: marketPackages[1],
    spaces,
    selectedSpaceId: "ops",
    agents,
    onEnact,
  });

  await expect.element(screen.getByRole("heading", { name: "Kit install" })).toBeVisible();
  await screen.getByRole("button", { name: "Continue" }).click();
  await expect.element(screen.getByText("Review and accept the preview before continuing.")).toBeVisible();

  await screen.getByLabelText("Accept install preview").click();
  await screen.getByRole("button", { name: "Continue" }).click();
  await expect.element(screen.getByRole("heading", { name: "Connect" })).toBeVisible();

  await screen.getByLabelText("Acknowledge dependencies").click();
  await screen.getByRole("button", { name: "Continue" }).click();
  await expect.element(screen.getByRole("heading", { name: "Staff", exact: true })).toBeVisible();

  const staffSelect = screen.getByRole("combobox", { name: "Agent for Loop operator" });
  await expect.element(staffSelect).toHaveValue("loop-owner");
  await screen.getByRole("button", { name: "Continue" }).click();

  await expect.element(screen.getByLabelText("Install label")).toHaveValue("Built-in Loop Templates");
  await screen.getByRole("button", { name: "Continue" }).click();

  await screen.getByLabelText("Confirm enactment review").click();
  await screen.getByRole("button", { name: "Stage install" }).click();

  expect(onEnact).toHaveBeenCalledWith({
    packageId: "builtin.loop-templates",
    packageVersion: "1.0.0",
    spaceId: "ops",
    configName: "Built-in Loop Templates",
    autonomy: "review_required",
    enableAfterInstall: false,
    staffing: [{ roleId: "loop-template-loop-operator", role: "Loop operator", agentId: "loop-owner" }],
  });
  await expect.element(screen.getByText("Built-in Loop Templates install plan is staged for Operations.")).toBeVisible();
});

test("blocks rail navigation from skipping incomplete install gates", async () => {
  const onEnact = vi.fn();
  const screen = await render(InstallWizard, {
    pkg: marketPackages[2],
    spaces,
    selectedSpaceId: "ops",
    agents,
    onEnact,
  });

  await expect.element(screen.getByRole("button", { name: /Connect/ })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: /Staff/ })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: /Configure/ })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: /Enact/ })).toBeDisabled();

  await screen.getByLabelText("Accept install preview").click();
  await screen.getByRole("button", { name: /Connect/ }).click();
  await expect.element(screen.getByRole("heading", { name: "Connect" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /Staff/ })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: /Enact/ })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stage install" })).not.toBeInTheDocument();
  expect(onEnact).not.toHaveBeenCalled();
});

test("revalidates prior gates before staging from the final step", async () => {
  const onEnact = vi.fn();
  const screen = await render(InstallWizard, {
    pkg: marketPackages[2],
    spaces,
    selectedSpaceId: "ops",
    agents,
    initialStepId: "enact",
    onEnact,
  });

  await expect.element(screen.getByRole("heading", { name: "Enact" })).toBeVisible();
  await screen.getByLabelText("Confirm enactment review").click();
  await screen.getByRole("button", { name: "Stage install" }).click();

  expect(onEnact).not.toHaveBeenCalled();
  await expect.element(screen.getByText("Preview: Review and accept the preview before continuing.")).toBeVisible();
});

test("renders loading, empty, error, and staffing states", async () => {
  const loading = await render(InstallWizard, { state: "loading" });
  expect(loading.container.textContent).toContain("Loading install wizard");

  const empty = await render(InstallWizard, { state: "empty" });
  await expect.element(empty.getByText("Package not found")).toBeVisible();

  const error = await render(InstallWizard, {
    state: "error",
    error: Object.assign(new Error("Catalog unavailable."), { status: 503 }),
  });
  await expect.element(error.getByText("Install wizard unavailable")).toBeVisible();

  const staffLoading = await render(InstallWizard, {
    pkg: marketPackages[2],
    spaces,
    selectedSpaceId: "ops",
    agentsState: "loading",
    initialStepId: "staff",
  });
  expect(staffLoading.container.textContent).toContain("Loading agents");

  const staffEmpty = await render(InstallWizard, {
    pkg: marketPackages[2],
    spaces,
    selectedSpaceId: "ops",
    agents: [],
    agentsState: "empty",
    initialStepId: "staff",
  });
  await expect.element(staffEmpty.getByText("No agents available")).toBeVisible();

  const staffError = await render(InstallWizard, {
    pkg: marketPackages[2],
    spaces,
    selectedSpaceId: "ops",
    agentsState: "error",
    agentsError: Object.assign(new Error("Agents unavailable."), { status: 503 }),
    initialStepId: "staff",
  });
  await expect.element(staffError.getByText("Unable to load agents")).toBeVisible();
});
