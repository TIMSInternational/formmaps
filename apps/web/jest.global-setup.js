/**
 * Forces a deterministic, negative-UTC-offset timezone for the whole Jest run.
 *
 * WHY THIS FILE EXISTS: mutating `process.env.TZ` from inside a test file's
 * `beforeAll()` (the previous approach, in dateUtils.test.ts / BookingModal
 * .test.tsx) is a no-op — Node/V8 resolves the local timezone once early in
 * the process's life, and the jsdom test environment for a file is already
 * constructed (and its Date/Intl behavior already locked in) before that
 * file's `beforeAll` runs. Reassigning `process.env.TZ` afterward changes
 * nothing. This was reproduced directly: `TZ=UTC npx jest
 * src/lib/__tests__/dateUtils.test.ts` failed the "proves the bug" sanity
 * assertion even with the `beforeAll` TZ reassignment in place, because the
 * ambient shell's TZ (not the reassignment) is what actually governs.
 *
 * `globalSetup` runs in the main Jest process before the worker pool starts
 * and before any jsdom environment is created for any test file — early
 * enough that mutating `process.env.TZ` here actually takes effect for every
 * test file's environment, no matter the ambient shell TZ. Verified
 * empirically for this repo's exact dependency versions (jest 29.7.0,
 * jest-environment-jsdom 30.2.0, jsdom 26.1.0 — this jsdom version has no
 * `testEnvironmentOptions.timezone` support at all, so that alternative
 * mechanism isn't available here): `TZ=UTC npx jest ...` and
 * `TZ=America/Los_Angeles npx jest ...` and a plain `npx jest ...` (no TZ set)
 * all resolve to the forced zone below, with and without `--runInBand`.
 *
 * This necessarily forces the WHOLE suite (not just the two files that need
 * it) onto a fixed timezone — Jest's `globalSetup` mutates `process.env` for
 * the entire run and cannot be scoped to a subset of test files or a single
 * `projects` entry (a `globalSetup` mutation was confirmed to leak across
 * every project in the same invocation while investigating this fix). This is
 * a deliberate, low-risk trade: no other test in this suite reads
 * `process.env.TZ` or `Intl.DateTimeFormat().resolvedOptions().timeZone`
 * directly (checked via `grep -rl "process.env.TZ\|getTimezoneOffset\|resolvedOptions().timeZone" src`),
 * and this repo's own ambient dev-machine default (America/Chicago) was
 * already a negative-UTC-offset zone of the same class as the one forced
 * below — so this makes the existing behavior deterministic, it doesn't
 * change it.
 */
module.exports = async () => {
  process.env.TZ = "America/New_York";
};
