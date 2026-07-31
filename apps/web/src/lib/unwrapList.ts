/**
 * Extracts an array from API responses that may be wrapped in various shapes:
 *   - Direct array
 *   - { data: [...] }
 *   - { data: { sessions: [...] } }
 *   - { data: { coaches: [...] } }
 *   - { data: { students: [...] } }
 *   - { data: { data: [...] } }
 *
 * @param response - The raw response from apiRequest
 * @param key - Optional named key to check first (e.g. "sessions", "coaches")
 */
export function unwrapList(response: unknown, key?: string): any[] {
  if (Array.isArray(response)) return response;

  const outer = (response as any)?.data;
  if (outer == null) return [];
  if (Array.isArray(outer)) return outer;

  if (key && Array.isArray(outer[key])) return outer[key];

  // Check common named keys
  for (const k of ["sessions", "coaches", "students", "data", "items"]) {
    if (Array.isArray(outer[k])) return outer[k];
  }

  return [];
}
