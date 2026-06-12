import { expect, test } from "vitest";
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

test("renders section summaries and default tab links", async () => {
  const screen = await render(SectionOverview, {
    title: "Team",
    subtitle: "Agents and runtime capabilities.",
    summaries,
    tabs,
    primaryHref: "/team/agents",
    primaryLabel: "Open agents",
  });

  await expect.element(screen.getByRole("heading", { name: "Team" })).toBeVisible();
  expect(screen.container.querySelector('[aria-label="Team summary"]')?.textContent).toContain("Agents");
  await expect.element(screen.getByRole("tab", { name: "Staff" })).toHaveAttribute("aria-selected", "true");
  await expect.element(screen.getByRole("link", { name: /Open agents/ })).toHaveAttribute("href", "/team/agents");
  await expect.element(screen.getByRole("link", { name: "Open", exact: true }).first()).toHaveAttribute("href", "/team/agents");
});

test("switches route groups without navigating away", async () => {
  const screen = await render(SectionOverview, {
    title: "Team",
    subtitle: "Agents and runtime capabilities.",
    summaries,
    tabs,
    primaryHref: "/team/agents",
    primaryLabel: "Open agents",
  });

  await screen.getByRole("tab", { name: "Capabilities" }).click();

  await expect.element(screen.getByRole("tab", { name: "Capabilities" })).toHaveAttribute("aria-selected", "true");
  await expect.element(screen.getByText("Skills and integration panels.")).toBeVisible();
  await expect.element(screen.getByRole("link", { name: "Open", exact: true })).toHaveAttribute("href", "/team/capabilities/skills");
});
