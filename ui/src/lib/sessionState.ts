export type LocalSessionUser = {
  id?: string;
  name: string;
  email: string;
  initial: string;
  avatarUrl: string;
};

// Older builds stored a client-only "signed out" flag under this key.
const LEGACY_SESSION_STATE_KEY = "nullhub-session-state";
const LOCAL_AUTH_KEYS = ["pocketbase_auth", "oauth_provider"];
const FALLBACK_SESSION_USER: LocalSessionUser = {
  name: "Workspace user",
  email: "Workspace access",
  initial: "W",
  avatarUrl: "",
};

type SessionUserSource = Record<string, unknown> | null | undefined;

export function fallbackSessionUser(): LocalSessionUser {
  return { ...FALLBACK_SESSION_USER };
}

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
    return normalizeSessionUser(stored.record || stored.model) ?? fallbackSessionUser();
  } catch {
    return fallbackSessionUser();
  }
}

export function sessionUserFromBootstrap(
  bootstrap: SessionUserSource,
  localUser: LocalSessionUser = fallbackSessionUser(),
): LocalSessionUser | null {
  if (!bootstrap || typeof bootstrap !== "object") return null;
  const user = normalizeSessionUser((bootstrap.user as SessionUserSource) || bootstrap);
  if (!user) return null;
  if (!user.avatarUrl && localUser.avatarUrl) {
    return { ...user, avatarUrl: localUser.avatarUrl };
  }
  return user;
}

export function normalizeSessionUser(source: SessionUserSource): LocalSessionUser | null {
  if (!source || typeof source !== "object") return null;

  const email = stringField(source, "email");
  const name = stringField(source, "name") || stringField(source, "username") || email;
  const avatarUrl =
    stringField(source, "avatar_url") ||
    stringField(source, "avatarUrl") ||
    stringField(source, "avatar") ||
    stringField(source, "picture");

  if (!name && !email && !avatarUrl) return null;

  return {
    id: stringField(source, "id") || undefined,
    name: name || fallbackSessionUser().name,
    email: email || fallbackSessionUser().email,
    initial: initialFor(name || email),
    avatarUrl,
  };
}

function stringField(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

function initialFor(label: string): string {
  const first = label.trim().charAt(0);
  return first ? first.toUpperCase() : fallbackSessionUser().initial;
}

function storageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}
