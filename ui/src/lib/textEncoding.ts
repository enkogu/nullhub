const cp1252Bytes: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

const mojibakePattern = /[ÐÑÃÂâðŸ]/;
const suspiciousPattern = /[ÐÑÃÂâðŸ�]/g;
const cyrillicPattern = /[\u0400-\u04ff]/;

function suspiciousScore(value: string): number {
  return value.match(suspiciousPattern)?.length ?? 0;
}

function latinishBytes(value: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined) return null;
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }
    const byte = cp1252Bytes[code];
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  return Uint8Array.from(bytes);
}

function cyrillicLeadBytes(value: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined) return null;
    if (code === 0xf0) {
      bytes.push(0xd0);
      continue;
    }
    if (code === 0xf1) {
      bytes.push(0xd1);
      continue;
    }
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }
    const byte = cp1252Bytes[code];
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  return Uint8Array.from(bytes);
}

function decodeUtf8(bytes: Uint8Array | null): string | null {
  if (!bytes) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function normalizeMojibakeText(value: string): string {
  if (!mojibakePattern.test(value)) return value;

  const decoded = decodeUtf8(latinishBytes(value)) ?? decodeUtf8(cyrillicLeadBytes(value));
  if (!decoded) return value;

  if (decoded === value) return value;
  if (suspiciousScore(decoded) >= suspiciousScore(value)) return value;

  return cyrillicPattern.test(decoded) || suspiciousScore(value) >= 2 ? decoded : value;
}

export function normalizeMojibakeValue<T>(value: T): T {
  if (typeof value === "string") return normalizeMojibakeText(value) as T;
  if (Array.isArray(value)) return value.map((item) => normalizeMojibakeValue(item)) as T;
  if (!value || typeof value !== "object") return value;

  const normalized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    normalized[key] = normalizeMojibakeValue(nested);
  }
  return normalized as T;
}
