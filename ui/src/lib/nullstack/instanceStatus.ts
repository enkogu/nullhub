const BUSY_INSTANCE_STATUSES = new Set(["running", "starting", "stopping", "restarting"]);

export function normalizedInstanceStatus(status: unknown): string {
  return String(status || "stopped").toLowerCase();
}

export function canStartInstanceStatus(status: unknown): boolean {
  return !BUSY_INSTANCE_STATUSES.has(normalizedInstanceStatus(status));
}

export function canStopInstanceStatus(status: unknown): boolean {
  return BUSY_INSTANCE_STATUSES.has(normalizedInstanceStatus(status));
}
