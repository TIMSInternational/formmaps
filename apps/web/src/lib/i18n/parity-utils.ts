/**
 * parity-utils.ts
 *
 * Pure helpers shared between:
 *   - scripts/check-i18n-parity.mjs  (CI / pre-commit parity guard)
 *   - src/lib/i18n/__tests__/parity-script.test.ts (unit tests)
 *
 * No external dependencies — Node built-ins only when consumed by the script.
 */

/** Flatten a nested object into dot-separated key paths. */
export function flattenKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: Record<string, any>,
  prefix = ""
): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/**
 * Compare two flattened key arrays.
 * Returns { onlyInA, onlyInB } — both empty when keys are in perfect parity.
 */
export function keysDiffer(
  enKeys: string[],
  esKeys: string[]
): { onlyInA: string[]; onlyInB: string[] } {
  const enSet = new Set(enKeys);
  const esSet = new Set(esKeys);
  const onlyInA = [...enSet].filter((k) => !esSet.has(k)).sort();
  const onlyInB = [...esSet].filter((k) => !enSet.has(k)).sort();
  return { onlyInA, onlyInB };
}
