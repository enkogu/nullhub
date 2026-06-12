import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import SectionOverview, { type SectionOverviewSummary, type SectionOverviewTab } from "./SectionOverview.svelte";

const summaries: SectionOverviewSummary[] = [
  { label: "Staff", value: "Agents", description: "Inspect active staff." },
  { label: "Runtime", value: "Instances", description: "Open installed instances." },
  { label: "Capabilities", value: "Skills", description: "Review skills and MCP." },
];

const tabs: SectionOverviewTab[] = [
  {
    value: "staff",
    label: "Staff",
    description: "Agent-facing panels.",
    links: [
      { label: "Agents", href: "/team/agents", description: "Active agents.", status: "Primary" },
      { label: "Roles", href: "/team/agents/roles", description: "Role definitions." },
    ],
  },
  {
    value: "capabilities",
    label: "Capabilities",
    description: "Skills and integration panels.",
    links: [
      { label: "Skills", href: "/team/capabilities/skills", description: "Installed skills." },
    ],
  },
];

const baseProps = {
  title: "Team",
  subtitle: "Agents and runtime capabilities.",
  summaries,
  tabs,
  primaryHref: "/team/agents",
  primaryLabel: "Open agents",
};

test("renders section summaries and default tab links", async () => {
  const screen = await render(SectionOverview, baseProps);

  await expect.element(screen.getByRole("heading", { name: "Team" })).toBeVisible();
  expect(screen.container.querySelector('[aria-label="Team summary"]')?.textContent).toContain("Agents");
  await expect.element(screen.getByRole("tab", { name: "Staff" })).toHaveAttribute("aria-selected", "true");
  await expect.element(screen.getByRole("link", { name: /Open agents/ })).toHaveAttribute("href", "/team/agents");
  await expect.element(screen.getByRole("link", { name: "Open", exact: true }).first()).toHaveAttribute("href", "/team/agents");
});

test("switches route groups without navigating away", async () => {
  const screen = await render(SectionOverview, baseProps);

  await screen.getByRole("tab", { name: "Capabilities" }).click();

  await expect.element(screen.getByRole("tab", { name: "Capabilities" })).toHaveAttribute("aria-selected", "true");
  await expect.element(screen.getByText("Skills and integration panels.")).toBeVisible();
  await expect.element(screen.getByRole("link", { name: "Open", exact: true })).toHaveAttribute("href", "/team/capabilities/skills");
});

test("renders loading state instead of populated summary and tabs", async () => {
  const screen = await render(SectionOverview, {
    ...baseProps,
    state: "loading",
    loadingTitle: "Loading Team",
    loadingDescription: "Fetching team sections.",
  });

  await expect.element(screen.getByRole("status")).toHaveTextContent("Loading Team");
  expect(screen.container.querySelector('[data-slot="section-overview"]')?.getAttribute("aria-busy")).toBe("true");
  expect(screen.container.querySelector('[aria-label="Team summary"]')).toBeNull();
  expect(screen.container.querySelector('[role="tab"]')).toBeNull();
});

test("renders empty state instead of populated summary and tabs", async () => {
  const screen = await render(SectionOverview, {
    ...baseProps,
    state: "empty",
    emptyTitle: "No Team panels",
    emptyDescription: "Team panels will appear once this space has agents, instances, or capabilities.",
    emptyActionLabel: "Open agents",
    emptyActionHref: "/team/agents",
  });

  await expect.element(screen.getByText("No Team panels")).toBeVisible();
  await expect.element(screen.getByText("Team panels will appear once this space has agents, instances, or capabilities.")).toBeVisible();
  expect(screen.container.querySelector('[data-slot="empty-state"]')).not.toBeNull();
  expect(screen.container.querySelector('[aria-label="Team summary"]')).toBeNull();
  expect(screen.container.querySelector('[role="tab"]')).toBeNull();
});

test("renders error state and retry action instead of populated summary and tabs", async () => {
  const onRetry = vi.fn();
  const screen = await render(SectionOverview, {
    ...baseProps,
    state: "error",
    errorTitle: "Unable to load Team",
    errorMessage: "Team overview data could not be fetched.",
    errorDetails: "GET /api/team/overview -> 503",
    retryLabel: "Retry",
    onRetry,
  });

  await expect.element(screen.getByText("Unable to load Team")).toBeVisible();
  await expect.element(screen.getByText("Team overview data could not be fetched.")).toBeVisible();
  await expect.element(screen.getByText("GET /api/team/overview -> 503")).toBeVisible();
  await screen.getByRole("button", { name: "Retry" }).click();

  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(screen.container.querySelector('[data-slot="error-state"]')).not.toBeNull();
  expect(screen.container.querySelector('[aria-label="Team summary"]')).toBeNull();
  expect(screen.container.querySelector('[role="tab"]')).toBeNull();
});
