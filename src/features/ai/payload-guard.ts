const FORBIDDEN_KEYS = new Set([
  "accountId",
  "account_id",
  "accountName",
  "entryId",
  "transactionId",
  "ledger",
  "sql",
  "categoryId",
]);

export function walkPayload(value: unknown, path = ""): string | null {
  if (value === null || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = walkPayload(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return `${path}.${key}`;
    }
    if (key === "note" || key === "notes") {
      const full = path ? `${path}.${key}` : key;
      if (!/^goals(\.\d+|\[\d+\])\.notes$/.test(full)) {
        return full;
      }
    }
    const child = walkPayload(obj[key], path ? `${path}.${key}` : key);
    if (child) return child;
  }
  return null;
}

export function progressDeepEqual(
  a: unknown,
  b: unknown,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}