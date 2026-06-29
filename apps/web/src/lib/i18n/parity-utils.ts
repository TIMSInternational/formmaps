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

// ─── Value-language smoke check ────────────────────────────────────────────────
//
// Key parity (above) proves en/es have the SAME key set. It cannot prove the
// es VALUES are actually translated — a key copied verbatim from en into es
// passes parity but renders English to Spanish users. This pair of helpers
// flags es values that are byte-identical to their en counterpart, after
// excluding values that are *legitimately* identical across languages
// (brand names, acronyms, pure-interpolation/punctuation/number strings).
//
// It is a REPORT-ONLY smoke check (never changes a gate's exit code): the
// "acceptable identical" set is a heuristic and real copy occasionally is the
// same in both languages, so flagged keys are translation CANDIDATES to review.

/** Interpolation placeholders like {{amount}} — language-neutral. */
const PLACEHOLDER_RE = /\{\{[^}]*\}\}/g;

/**
 * Brand names, product names, and acronyms that are intentionally identical in
 * English and Spanish. Compared case-sensitively against the whole stripped value.
 */
export const ACCEPTABLE_IDENTICAL_TOKENS = new Set<string>([
  "FormMaps",
  "FORMMAPS",
  "FORM",
  "MAPS",
  "PCA",
  "MIL",
  "LIA",
  "DISC",
  "JCA",
  "GPA",
  "AI",
  "PDF",
  "URL",
  "ID",
  "OK",
  "SMS",
  "FAQ",
  "CSV",
  "API",
  "SAT",
  "ACT",
  "IB",
  "AP",
  "STEM",
  "TOEFL",
  "IELTS",
  "Email",
  "email",
  "e-mail",
]);

/**
 * Whether an identical en/es value is acceptable (NOT a translation gap).
 * Acceptable when, after stripping interpolation placeholders and surrounding
 * whitespace, the value is empty, contains no letters at all (numbers /
 * punctuation / symbols), is a known brand-or-acronym token, or is a short
 * all-caps/numeric acronym (≤ 4 chars).
 */
export function isAcceptableIdentical(value: string): boolean {
  const stripped = value.replace(PLACEHOLDER_RE, "").trim();
  if (!stripped) return true; // empty or pure interpolation, e.g. "{{count}}"
  if (!/\p{L}/u.test(stripped)) return true; // no letters → language-neutral
  if (ACCEPTABLE_IDENTICAL_TOKENS.has(stripped)) return true;
  if (/^[A-Z0-9]{1,4}$/.test(stripped)) return true; // short acronym e.g. "MBTI"
  return false;
}

/**
 * Given two parallel locale objects (en, es), return the keys whose es value is
 * byte-identical (after trim) to en AND not acceptably so — i.e. likely
 * untranslated. Only compares string leaves present as strings in both.
 * Returns sorted [{ key, value }].
 */
export function valueLanguageMatches(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enObj: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  esObj: Record<string, any>
): { key: string; value: string }[] {
  const flatten = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    obj: Record<string, any>,
    prefix = "",
    out: Record<string, unknown> = {}
  ): Record<string, unknown> => {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        flatten(v, path, out);
      } else {
        out[path] = v;
      }
    }
    return out;
  };

  const enFlat = flatten(enObj);
  const esFlat = flatten(esObj);
  const hits: { key: string; value: string }[] = [];

  for (const [key, enVal] of Object.entries(enFlat)) {
    if (typeof enVal !== "string") continue;
    const esVal = esFlat[key];
    if (typeof esVal !== "string") continue;
    if (enVal.trim() !== esVal.trim()) continue;
    if (isAcceptableIdentical(enVal)) continue;
    hits.push({ key, value: enVal });
  }

  return hits.sort((a, b) => a.key.localeCompare(b.key));
}
