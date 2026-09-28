/**
 * Hard navigation for a forced sign-out. A full page load, not router.replace: it drops every
 * piece of in-memory state from the signed-out account, and it cannot race AuthWrapper's own
 * redirect (which would replace `?reason=` with a plain `?redirect=`). Its own module so tests
 * can mock it — jsdom does not implement navigation.
 */
export function hardNavigate(url: string): void {
  window.location.replace(url);
}
