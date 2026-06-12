import { afterEach, describe, expect, test } from "vitest";
import {
  setSelectedBoilerInstance,
  setSelectedTicketsInstance,
} from "./backendSelection";

const originalDescriptors = new Map(
  ["location", "history", "localStorage"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);

function restoreGlobalProperty(key: string) {
  const descriptor = originalDescriptors.get(key);
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
  } else {
    delete (globalThis as Record<string, unknown>)[key];
  }
}

function installLocation(path: string) {
  const url = new URL(path, "https://nullhub.local");
  const replacements: string[] = [];
  const stored = new Map<string, string>();
  const state = { test: true };

  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: {
      href: url.href,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    },
  });

  Object.defineProperty(globalThis, "history", {
    configurable: true,
    value: {
      state,
      replaceState(nextState: unknown, _title: string, nextUrl: string) {
        expect(nextState).toBe(state);
        replacements.push(nextUrl);
      },
    },
  });

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem(key: string) {
        return stored.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        stored.set(key, value);
      },
      removeItem(key: string) {
        stored.delete(key);
      },
    },
  });

  return { replacements, stored };
}

afterEach(() => {
  restoreGlobalProperty("location");
  restoreGlobalProperty("history");
  restoreGlobalProperty("localStorage");
});

describe("backend selection URL sync", () => {
  test("syncs selected NullBoiler instance on canonical workflow pages", () => {
    const { replacements } = installLocation("/orders/workflows?space=ops#definitions");

    setSelectedBoilerInstance("boiler-two");

    expect(replacements).toEqual([
      "/orders/workflows?space=ops&boiler_instance=boiler-two#definitions",
    ]);
  });

  test("replaces selected NullBoiler instance on canonical workflow run pages", () => {
    const { replacements } = installLocation("/orders/workflows/runs/run-1?boiler_instance=old");

    setSelectedBoilerInstance("boiler-two");

    expect(replacements).toEqual([
      "/orders/workflows/runs/run-1?boiler_instance=boiler-two",
    ]);
  });

  test("syncs selected NullTickets instance on canonical loop pages", () => {
    const { replacements } = installLocation("/orders/loops/library?tab=installed&space=ops#loops");

    setSelectedTicketsInstance("tickets-two");

    expect(replacements).toEqual([
      "/orders/loops/library?tab=installed&space=ops&tickets_instance=tickets-two#loops",
    ]);
  });

  test("syncs selected NullTickets instance on the canonical store page", () => {
    const { replacements } = installLocation("/market/nulltickets/store?space=ops");

    setSelectedTicketsInstance("tickets-two");

    expect(replacements).toEqual([
      "/market/nulltickets/store?space=ops&tickets_instance=tickets-two",
    ]);
  });

  test("does not rewrite unrelated routes", () => {
    const { replacements } = installLocation("/system/settings?space=ops");

    setSelectedBoilerInstance("boiler-two");
    setSelectedTicketsInstance("tickets-two");

    expect(replacements).toEqual([]);
  });
});
