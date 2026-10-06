/**
 * The React key AuthWrapper puts on everything below it. Changing it remounts the whole page,
 * discarding in-memory state — which must happen whenever a signed-in identity ENDS or CHANGES
 * (logout, or one account replaced by another), so one person's data (e.g. a prior student's
 * assessment scores in useState) never leaks to the next.
 *
 * Signing in FROM ANONYMOUS (login, signup, accepting an invite) carries no prior account's
 * data, so it keeps the key. Remounting there broke every onboarding flow that signs the person
 * in and then keeps showing a screen: the invite page re-ran its token check against the token it
 * had just consumed and flashed "invitation link not valid", and the counselor flow lost its
 * calendar step and fell back to an empty form.
 */
export interface SessionKeyState {
  /** The user id the current key was issued for; null while anonymous. */
  id: string | null;
  /** Bumped on every end/change of a signed-in identity. */
  generation: number;
}

export function nextSessionKey(prev: SessionKeyState, nextId: string | null | undefined): SessionKeyState {
  const id = nextId ?? null;
  if (id === prev.id) return prev;
  // anonymous → signed in: same page, same state.
  if (prev.id === null) return { id, generation: prev.generation };
  // logout, or account A → account B: start clean.
  return { id, generation: prev.generation + 1 };
}
