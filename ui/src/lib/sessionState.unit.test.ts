import { afterEach, describe, expect, test } from "vitest";
import {
  fallbackSessionUser,
  normalizeSessionUser,
  readLocalSessionUser,
  sessionUserFromBootstrap,
} from "./sessionState";

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function restoreLocalStorage() {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    return;
  }
  Reflect.deleteProperty(globalThis, "localStorage");
}

function installLocalAuth(value: unknown) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (key === "pocketbase_auth" ? JSON.stringify(value) : null),
      removeItem: () => {},
    },
  });
}

afterEach(() => {
  restoreLocalStorage();
});

describe("session user identity", () => {
  test("reads the PocketBase local auth record with name, email, avatar, and initial", () => {
    installLocalAuth({
      token: "pb-token",
      record: {
        id: "usr_123",
        name: "Ada Lovelace",
        email: "ada@example.com",
        avatar_url: "https://cdn.example.test/ada.png",
      },
    });

    expect(readLocalSessionUser()).toEqual({
      id: "usr_123",
      name: "Ada Lovelace",
      email: "ada@example.com",
      initial: "A",
      avatarUrl: "https://cdn.example.test/ada.png",
    });
  });

  test("uses email as the visible label when the session has no display name", () => {
    expect(normalizeSessionUser({ email: "operator@example.com" })).toEqual({
      id: undefined,
      name: "operator@example.com",
      email: "operator@example.com",
      initial: "O",
      avatarUrl: "",
    });
  });

  test("returns a neutral workspace fallback when local auth is missing", () => {
    installLocalAuth({});

    expect(readLocalSessionUser()).toEqual(fallbackSessionUser());
    expect(readLocalSessionUser().name).not.toBe("Volksdroid");
    expect(readLocalSessionUser().email).not.toBe("Local session");
  });

  test("prefers the authenticated bootstrap user and preserves a local OAuth avatar", () => {
    const localUser = normalizeSessionUser({
      name: "Stale Local",
      email: "stale@example.com",
      avatar_url: "https://cdn.example.test/local-avatar.png",
    });

    expect(sessionUserFromBootstrap({
      user: {
        id: "usr_live",
        name: "Grace Hopper",
        email: "grace@example.com",
      },
    }, localUser ?? fallbackSessionUser())).toEqual({
      id: "usr_live",
      name: "Grace Hopper",
      email: "grace@example.com",
      initial: "G",
      avatarUrl: "https://cdn.example.test/local-avatar.png",
    });
  });

  test("uses an avatar URL from the authenticated bootstrap user when provided", () => {
    expect(sessionUserFromBootstrap({
      user: {
        name: "Lin Chen",
        email: "lin@example.com",
        avatarUrl: "https://cdn.example.test/lin.png",
      },
    })).toEqual({
      id: undefined,
      name: "Lin Chen",
      email: "lin@example.com",
      initial: "L",
      avatarUrl: "https://cdn.example.test/lin.png",
    });
  });
});
