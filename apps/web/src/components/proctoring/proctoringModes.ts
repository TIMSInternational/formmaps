import type { ProctoringMode } from "./useProctoring";

/**
 * Which proctoring mode each runner uses (#392 — decision pending).
 *
 * - "enforce": blocking overlays + forced fullscreen (timed ability tests).
 * - "record": violations captured and flushed as evidence, never blocks.
 *
 * Untimed preference/perception questionnaires have no "right answer" to look
 * up on a second screen, so they record only. To revert any instrument to the
 * previous hard-blocking behaviour, flip its value to "enforce" — one line.
 */
export const PROCTORING_MODE_BY_INSTRUMENT = {
  lia: "enforce",
  pca: "enforce",
  personality: "record",
  /** `/evaluation/evaluator` — 360 self-evaluation AND external evaluators (parents, teachers, peers). */
  evaluator360: "record",
} as const satisfies Record<string, ProctoringMode>;
