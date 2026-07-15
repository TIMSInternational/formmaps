/**
 * Shared proctoring types. Promoted out of `liaService` so every assessment
 * runner (LIA, evaluator, PCA, personality) can share one violation shape.
 * `liaService` re-exports `LockdownViolation` from here for back-compat.
 */

/** A single exam-integrity event recorded by the proctoring layer. */
export interface LockdownViolation {
  type: string;
  timestamp: string;
  details?: string;
}
