import { describe, expect, test } from "vitest";
import { agentDetailHashForTab, normalizeAgentDetailTab } from "./agentDetailTabs";

describe("agent detail tab aliases", () => {
  test("normalizes product tab hashes to remounted legacy panels", () => {
    expect(normalizeAgentDetailTab("knowledge")).toBe("memory");
    expect(normalizeAgentDetailTab("integrations")).toBe("mcp");
    expect(normalizeAgentDetailTab("schedules")).toBe("cron");
    expect(normalizeAgentDetailTab("sessions")).toBe("history");
  });

  test("keeps legacy hashes reachable while publishing product-facing hashes", () => {
    expect(normalizeAgentDetailTab("memory")).toBe("memory");
    expect(normalizeAgentDetailTab("mcp")).toBe("mcp");
    expect(agentDetailHashForTab("memory")).toBe("knowledge");
    expect(agentDetailHashForTab("mcp")).toBe("integrations");
    expect(agentDetailHashForTab("cron")).toBe("schedules");
    expect(agentDetailHashForTab("history")).toBe("sessions");
  });

  test("rejects unknown tab hashes", () => {
    expect(normalizeAgentDetailTab("raw-path")).toBe("");
    expect(agentDetailHashForTab("raw-path")).toBe("");
  });
});
