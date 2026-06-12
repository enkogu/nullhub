export const agentDetailTabValues = new Set([
  "overview",
  "chat",
  "history",
  "memory",
  "skills",
  "mcp",
  "hooks",
  "cron",
  "docs",
  "config",
  "logs",
  "advanced",
]);

const productHashToLegacyTab: Record<string, string> = {
  knowledge: "memory",
  integrations: "mcp",
  schedules: "cron",
  sessions: "history",
};

const legacyTabToProductHash: Record<string, string> = {
  memory: "knowledge",
  mcp: "integrations",
  cron: "schedules",
  history: "sessions",
};

export function normalizeAgentDetailTab(value: string): string {
  const tab = value.trim().toLowerCase();
  const normalized = productHashToLegacyTab[tab] || tab;
  return agentDetailTabValues.has(normalized) ? normalized : "";
}

export function agentDetailHashForTab(value: string): string {
  const tab = normalizeAgentDetailTab(value);
  return legacyTabToProductHash[tab] || tab;
}
