export type LocalSessionUser = {
  name: string;
  email: string;
  initial: string;
};

// Older builds stored a client-only "signed out" flag under this key.
const LEGACY_SESSION_STATE_KEY = "nullhub-session-state";
const LOCAL_AUTH_KEYS = ["pocketbase_auth", "oauth_provider"];

export function clearLocalAuth(): void {
  if (!storageAvailable()) return;

  for (const key of LOCAL_AUTH_KEYS) {
    localStorage.removeItem(key);
  }
  localStorage.removeItem(LEGACY_SESSION_STATE_KEY);

  if (typeof sessionStorage !== "undefined") {
    for (const key of LOCAL_AUTH_KEYS) {
      sessionStorage.removeItem(key);
    }
  }
}

export function readLocalSessionUser(): LocalSessionUser {
  try {
    const stored = JSON.parse(localStorage.getItem("pocketbase_auth") || "{}");
    const record = stored.record || stored.model || {};
    const email = typeof record.email === "string" ? record.email.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const label = name || email || "Local session";
    const initial = (name || email || "N").charAt(0).toUpperCase();
    return {
      name: label,
      email: email || "Workspace access",
      initial,
    };
  } catch {
    return {
      name: "Local session",
      email: "Workspace access",
      initial: "N",
    };
  }
}

function storageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}
