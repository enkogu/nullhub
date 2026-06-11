import { describe, expect, test } from "vitest";
import { normalizeLoopTemplate, storeEntryHasInlineValue, storeEntryKey, storeEntryValue } from "./marketplace";
import { templateDefinition } from "./templates";

describe("loop marketplace catalog normalization", () => {
  test("normalizes a store entry with snake_case fields into a loop template", () => {
    const entry = {
      key: "support-triage",
      value: {
        name: "Support Triage",
        category: "Support",
        machine: "Support Machine",
        summary: "Triage inbound support tickets.",
        goal: "Every new support request has a clear owner and next action.",
        exit_condition: "All requests have an owner.",
        check_instruction: "Check each request for owner and next action.",
        max_iterations: "4",
        starter: {
          title: "Triage support tickets",
          description: "Review the new support inbox.",
          priority: 60,
        },
      },
    };

    const template = normalizeLoopTemplate(storeEntryValue(entry), storeEntryKey(entry));
    expect(template).toMatchObject({
      slug: "support-triage",
      name: "Support Triage",
      category: "Support",
      machine: "Support Machine",
      maxIterations: 4,
      source: "marketplace",
      starter: {
        title: "Triage support tickets",
        priority: 60,
      },
    });
    expect(templateDefinition(template!).loop).toMatchObject({
      slug: "support-triage",
      source: "marketplace",
      max_iterations: 4,
    });
  });

  test("treats key-only store metadata as a pointer that needs a value fetch", () => {
    expect(storeEntryHasInlineValue({ key: "support-triage", name: "Support Triage" })).toBe(false);
    expect(storeEntryHasInlineValue({ key: "support-triage", value: { name: "Support Triage" } })).toBe(true);
  });

  test("rejects incomplete templates instead of fabricating executable loop behavior", () => {
    expect(normalizeLoopTemplate({ slug: "thin-template", name: "Thin Template" })).toBeNull();
    expect(
      normalizeLoopTemplate({
        slug: "missing-instructions",
        name: "Missing Instructions",
        tagline: "A partial remote template.",
        goal: "Do useful work.",
        exit_condition: "The useful work is done.",
      }),
    ).toBeNull();
  });
});
