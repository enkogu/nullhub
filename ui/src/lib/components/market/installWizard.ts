import type { DataStateKind } from "$lib/components/DataState.svelte";
import type { PackageContribution, PackageManifest, PackageRequirement } from "$lib/api/packages";

export type InstallWizardStepId = "preview" | "connect" | "staff" | "configure" | "enact";

export type InstallAgentOption = {
  id: string;
  name: string;
  role: string;
  status: string;
  description?: string;
};

export type InstallStaffingRole = {
  id: string;
  label: string;
  description: string;
  required: boolean;
};

export type InstallStaffingMap = Record<string, string>;

export type InstallValidationState = {
  selectedSpaceId?: string | null;
  previewAccepted?: boolean;
  secretConfirmations?: Record<string, boolean>;
  dependenciesAcknowledged?: boolean;
  agentsState?: DataStateKind;
  roles?: InstallStaffingRole[];
  staffingMap?: InstallStaffingMap;
  configName?: string;
  enactAccepted?: boolean;
};

export type InstallPayload = {
  packageId: string;
  packageVersion: string;
  spaceId: string;
  configName: string;
  autonomy: "review_required" | "auto_start_paused";
  enableAfterInstall: boolean;
  staffing: Array<{ roleId: string; role: string; agentId: string }>;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return "";
}

function roleFromContribution(contribution: PackageContribution): InstallStaffingRole {
  const labelByKind: Record<string, string> = {
    agent_profile: "Agent profile owner",
    loop_template: "Loop operator",
    workflow_template: "Workflow operator",
    mcp_server: "Tool maintainer",
    order_template: "Order owner",
    space_defaults: "Space operator",
    team_capability: "Runtime operator",
    skill: "Skill maintainer",
  };
  const label = labelByKind[contribution.kind] || `${contribution.label} owner`;
  return {
    id: slug(`${contribution.kind}-${label}`) || "package-owner",
    label,
    description: `Responsible for ${contribution.name || contribution.target || contribution.label}.`,
    required: true,
  };
}

function normalizeDeclaredRole(raw: unknown, index: number): InstallStaffingRole | null {
  if (typeof raw === "string") {
    const label = raw.trim();
    if (!label) return null;
    return {
      id: slug(label) || `role-${index + 1}`,
      label,
      description: "Assign an agent before this package goes live.",
      required: true,
    };
  }
  const item = recordValue(raw);
  const label = firstText(item.label, item.name, item.role, item.id);
  if (!label) return null;
  return {
    id: slug(firstText(item.id, item.role, label)) || `role-${index + 1}`,
    label,
    description: firstText(item.description, item.summary) || "Assign an agent before this package goes live.",
    required: item.required !== false,
  };
}

function uniqueRoles(roles: InstallStaffingRole[]): InstallStaffingRole[] {
  const seen = new Set<string>();
  return roles.filter((role) => {
    const key = role.id || slug(role.label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function packageInstallLabel(pkg: PackageManifest): string {
  return pkg.scale === "blueprint" ? "Blueprint" : pkg.scale === "kit" ? "Kit" : "Component";
}

export function packageSecretRequirements(pkg: PackageManifest): PackageRequirement[] {
  return pkg.requires.filter((item) => item.kind === "secret_ref");
}

export function packageDependencyRequirements(pkg: PackageManifest): PackageRequirement[] {
  return pkg.requires.filter((item) => item.kind !== "secret_ref");
}

export function packageStaffingRoles(pkg: PackageManifest): InstallStaffingRole[] {
  const config = recordValue(pkg.config);
  const raw = recordValue(pkg.raw);
  const declared = [
    ...arrayValue(config.staffing),
    ...arrayValue(config.roles),
    ...arrayValue(raw.staffing),
    ...arrayValue(raw.roles),
  ]
    .map(normalizeDeclaredRole)
    .filter((role): role is InstallStaffingRole => Boolean(role));
  if (declared.length > 0) return uniqueRoles(declared);

  const derived = pkg.contributes.map(roleFromContribution);
  if (derived.length > 0) return uniqueRoles(derived);
  return [
    {
      id: "package-owner",
      label: "Package owner",
      description: "Responsible for the installed package after it goes live.",
      required: true,
    },
  ];
}

export function packageBlastRadiusItems(pkg: PackageManifest): string[] {
  const target = pkg.installTarget ? [`Install target: ${pkg.installTarget}`] : [];
  const contributions = pkg.contributes.map((item) => `${item.label}: ${item.name || item.target || item.id}`);
  const seeds = pkg.seeds.map((seed, index) => {
    const item = recordValue(seed);
    return `${firstText(item.kind, "Seed")}: ${firstText(item.name, item.title, item.slug, `Seed ${index + 1}`)}`;
  });
  return [...target, ...contributions, ...seeds];
}

export function agentOptionsFromStatus(status: unknown): InstallAgentOption[] {
  const instances = recordValue(recordValue(status).instances);
  const nullclawInstances = recordValue(instances.nullclaw);
  return Object.entries(nullclawInstances)
    .map(([name, info]) => {
      const item = recordValue(info);
      const metadata = recordValue(item.metadata);
      const role = firstText(item.profile, item.role, metadata.role, item.launch_mode, "agent");
      return {
        id: name,
        name,
        role,
        status: firstText(item.status, "stopped"),
        description: firstText(item.current_work, item.currentWork, metadata.current_work, metadata.currentWork),
      };
    })
    .sort((a, b) => {
      if (a.status === "running" && b.status !== "running") return -1;
      if (a.status !== "running" && b.status === "running") return 1;
      return a.name.localeCompare(b.name);
    });
}

export function mapRolesToAgents(
  roles: InstallStaffingRole[],
  agents: InstallAgentOption[],
  current: InstallStaffingMap = {},
): InstallStaffingMap {
  const availableIds = new Set(agents.map((agent) => agent.id));
  const next: InstallStaffingMap = {};
  for (const role of roles) {
    const existing = current[role.id];
    if (existing && availableIds.has(existing)) {
      next[role.id] = existing;
      continue;
    }
    const roleWords = normalizeSearch(role.label).split(" ").filter(Boolean);
    const matchingAgent = agents
      .map((agent) => {
        const haystack = normalizeSearch(`${agent.name} ${agent.role} ${agent.description || ""}`);
        return {
          agent,
          score: roleWords.filter((part) => haystack.includes(part)).length,
        };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || (a.agent.status === "running" ? -1 : 1))[0]?.agent;
    const fallback = matchingAgent || agents.find((agent) => agent.status === "running") || agents[0];
    if (fallback) next[role.id] = fallback.id;
  }
  return next;
}

export function staffingComplete(
  roles: InstallStaffingRole[],
  staffingMap: InstallStaffingMap,
  agentsState: DataStateKind = "populated",
): boolean {
  if (roles.length === 0) return true;
  if (agentsState !== "populated") return false;
  return roles.filter((role) => role.required).every((role) => Boolean(staffingMap[role.id]));
}

export function validateInstallStep(stepId: InstallWizardStepId, state: InstallValidationState): string {
  if (stepId === "preview") {
    if (!state.selectedSpaceId) return "Select one Space before installing this package.";
    if (!state.previewAccepted) return "Review and accept the preview before continuing.";
  }
  if (stepId === "connect") {
    const secrets = Object.values(state.secretConfirmations || {});
    if (secrets.some((confirmed) => !confirmed)) return "Confirm every required secret ref before continuing.";
    if (state.dependenciesAcknowledged === false) return "Review package and component dependencies before continuing.";
  }
  if (stepId === "staff") {
    if (state.agentsState === "loading") return "Wait for agent staffing data to finish loading.";
    if (state.agentsState === "error") return "Resolve the agent staffing error before continuing.";
    if (state.agentsState === "empty") return "Add at least one agent before staffing this package.";
    if (!staffingComplete(state.roles || [], state.staffingMap || {}, state.agentsState)) {
      return "Assign an agent to every required package role.";
    }
  }
  if (stepId === "configure" && !stringValue(state.configName)) {
    return "Enter an install label before continuing.";
  }
  if (stepId === "enact" && !state.enactAccepted) {
    return "Confirm the final enactment review before marking the package ready.";
  }
  return "";
}
