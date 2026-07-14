"use client";

/**
 * LIA back-compat shim. The lockdown/proctoring implementation was promoted to
 * the shared `@/components/proctoring` layer so every assessment runner can use
 * it. LIA and its tests keep importing `useLockdown`/`Lockdown` from here.
 */
export { useProctoring as useLockdown, FACE_VERIFY_ENABLED } from "@/components/proctoring/useProctoring";
export type { Proctoring as Lockdown } from "@/components/proctoring/useProctoring";
export type { LockdownViolation } from "@/components/proctoring/types";
