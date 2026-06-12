import { describe, expect, test } from "vitest";
import { marketPackages } from "./fixtures";
import {
  agentOptionsFromStatus,
  mapRolesToAgents,
  packageSecretRequirements,
  packageStaffingRoles,
  staffingComplete,
  validateInstallStep,
  type InstallAgentOption,
} from "./installWizard";

const agents: InstallAgentOption[] = [
  { id: "runtime", name: "runtime", role: "Runtime operator", status: "running" },
  { id: "loop-owner", name: "loop-owner", role: "Loop operator", status: "running" },
  { id: "tool-owner", name: "tool-owner", role: "Tool maintainer", status: "stopped" },
];

describe("install wizard model", () => {
  test("derives staffing roles and maps them to matching agents", () => {
    const roles = packageStaffingRoles(marketPackages[1]);
    const mapped = mapRolesToAgents(roles, agents);

    expect(roles.map((role) => role.label)).toContain("Loop operator");
    expect(mapped[roles.find((role) => role.label === "Loop operator")!.id]).toBe("loop-owner");

    const remapped = mapRolesToAgents(roles, agents, { [roles[0].id]: "runtime" });
    expect(remapped[roles[0].id]).toBe("runtime");
  });

  test("normalizes NullClaw status payloads into staffing agent options", () => {
    const options = agentOptionsFromStatus({
      instances: {
        nullclaw: {
          beta: { status: "stopped", metadata: { role: "Loop operator" } },
          alpha: { status: "running", role: "Runtime operator", current_work: "Morning brief" },
        },
      },
    });

    expect(options.map((agent) => agent.id)).toEqual(["alpha", "beta"]);
    expect(options[0]).toMatchObject({ role: "Runtime operator", status: "running", description: "Morning brief" });
  });

  test("validates preview, connect, staffing, configure, and enact gates", () => {
    const secret = packageSecretRequirements(marketPackages[0])[0];
    const secretKey = secret.secretRef || secret.name;

    expect(validateInstallStep("preview", { selectedSpaceId: null, previewAccepted: true })).toBe(
      "Select one Space before installing this package.",
    );
    expect(validateInstallStep("preview", { selectedSpaceId: "ops", previewAccepted: false })).toBe(
      "Review and accept the preview before continuing.",
    );
    expect(validateInstallStep("connect", { secretConfirmations: { [secretKey]: false }, dependenciesAcknowledged: true })).toBe(
      "Confirm every required secret ref before continuing.",
    );
    expect(validateInstallStep("staff", { agentsState: "loading" })).toBe(
      "Wait for agent staffing data to finish loading.",
    );
    expect(validateInstallStep("staff", { agentsState: "empty" })).toBe(
      "Add at least one agent before staffing this package.",
    );
    expect(validateInstallStep("staff", { agentsState: "error" })).toBe(
      "Resolve the agent staffing error before continuing.",
    );
    expect(validateInstallStep("configure", { configName: "" })).toBe(
      "Enter an install label before continuing.",
    );
    expect(validateInstallStep("enact", { enactAccepted: false })).toBe(
      "Confirm the final enactment review before marking the package ready.",
    );
  });

  test("reports staffing completion only for populated agent data with assigned required roles", () => {
    const roles = packageStaffingRoles(marketPackages[2]);
    const mapped = mapRolesToAgents(roles, agents);

    expect(staffingComplete(roles, mapped, "populated")).toBe(true);
    expect(staffingComplete(roles, mapped, "loading")).toBe(false);
    expect(staffingComplete(roles, {}, "populated")).toBe(false);
  });
});
