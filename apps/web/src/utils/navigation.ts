/**
 * Hard browser navigation (full page load).
 * Kept in its own module so tests can mock it — jsdom cannot perform navigation.
 */
export function hardNavigate(url: string): void {
  if (typeof window === "undefined") return;
  window.location.href = url;
}
