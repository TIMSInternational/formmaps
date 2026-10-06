/**
 * The password rule BOTH backends enforce (legacy lib/auth.ts validatePasswordStrength and .NET
 * FormMaps.Application/Auth/PasswordStrength.cs) — same checks, same order, same special-character
 * set. Every form that sets a password checks this before submitting, so nobody types a password
 * the form accepts and then gets a server error after pressing the button. Before this, no form
 * mentioned the special character, and several only checked the length.
 */
export type PasswordRule = "min8" | "upper" | "lower" | "digit" | "special";

// Character class copied from the backends' SpecialCharRegex: ! @ # $ % ^ & * ( ) _ - + = [ ] { } ; : ' " , . < > ? / \ | ` ~
const SPECIAL = /[!@#$%^&*()_\-+=[\]{};:'",.<>?/\\|`~]/;

export const PASSWORD_RULES: ReadonlyArray<{ rule: PasswordRule; test: (p: string) => boolean }> = [
  { rule: "min8", test: (p) => p.length >= 8 },
  { rule: "upper", test: (p) => /[A-Z]/.test(p) },
  { rule: "lower", test: (p) => /[a-z]/.test(p) },
  { rule: "digit", test: (p) => /\d/.test(p) },
  { rule: "special", test: (p) => SPECIAL.test(p) },
];

/** The first rule the password breaks, in the backends' order; null when it satisfies them all. */
export function firstPasswordProblem(password: string): PasswordRule | null {
  return PASSWORD_RULES.find((r) => !r.test(password))?.rule ?? null;
}

/** i18n key for the message to show when `rule` is broken. */
export const passwordProblemKey = (rule: PasswordRule) => `auth.passwordRules.problem.${rule}`;
/** i18n key for the short checklist label of `rule`. */
export const passwordRuleLabelKey = (rule: PasswordRule) => `auth.passwordRules.label.${rule}`;
