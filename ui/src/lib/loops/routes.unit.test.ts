import { describe, expect, test } from "vitest";
import { loopRoutes } from "./routes";

describe("canonical loop routes", () => {
  test("uses product IA routes for loop definitions and support pages", () => {
    expect(loopRoutes.definitions).toBe("/orders/loops");
    expect(loopRoutes.library).toBe("/orders/loops/library");
    expect(loopRoutes.marketplace).toBe("/market/loops");
    expect(loopRoutes.teamAgents).toBe("/team/agents");
    expect(loopRoutes.teamInstances).toBe("/team/instances");
  });

  test("builds canonical loop run links with preserved filters", () => {
    expect(loopRoutes.runs()).toBe("/work/loops/runs");
    expect(loopRoutes.runs({ filter: "attention" })).toBe("/work/loops/runs?filter=attention");
    expect(loopRoutes.runs({ loop: "weekly report" })).toBe("/work/loops/runs?loop=weekly+report");
    expect(loopRoutes.runs({ filter: "active", loop: "loop-1" })).toBe(
      "/work/loops/runs?filter=active&loop=loop-1",
    );
  });
});
