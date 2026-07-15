/**
 * Convert PascalCase / mixed-case object keys to camelCase.
 * Recursively handles objects, arrays, and passes primitives through.
 *
 * Use the generic overload — `toCamel<MyType>(data)` — when you need
 * the return value typed without a separate `as` cast.
 */
export function toCamel<T = unknown>(obj: unknown): T {
  if (obj === null || obj === undefined || typeof obj !== "object" || obj instanceof Date) {
    return obj as T;
  }
  if (Array.isArray(obj)) return obj.map(toCamel) as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
    result[camelKey] = toCamel(value);
  }
  return result as T;
}
