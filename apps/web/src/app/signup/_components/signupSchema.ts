import * as z from "zod";

/**
 * Builds the signup schema with translated validation messages.
 * Call inside a component with the i18n `t` so messages localize.
 */
export function makeSignupSchema(t: (key: string) => string) {
  return z
    .object({
      firstName: z
        .string()
        .min(1, t("auth.validation.firstNameRequired"))
        .min(2, t("auth.validation.firstNameMin")),
      lastName: z
        .string()
        .min(1, t("auth.validation.lastNameRequired"))
        .min(2, t("auth.validation.lastNameMin")),
      email: z
        .string()
        .min(1, t("auth.validation.emailRequired"))
        .email(t("auth.validation.emailInvalid")),
      password: z
        .string()
        .min(8, t("auth.validation.passwordMin"))
        .regex(/[A-Z]/, t("auth.validation.passwordUpper"))
        .regex(/[a-z]/, t("auth.validation.passwordLower"))
        .regex(/[0-9]/, t("auth.validation.passwordNumber")),
      confirmPassword: z.string().min(1, t("auth.validation.confirmRequired")),
      dateOfBirth: z
        .string()
        .min(1, t("auth.validation.dobRequired"))
        .refine((s) => {
          const d = new Date(s);
          if (isNaN(d.getTime()) || d > new Date()) return false;
          const thirteenAgo = new Date();
          thirteenAgo.setFullYear(thirteenAgo.getFullYear() - 13);
          return d <= thirteenAgo;
        }, t("auth.validation.dobAge")),
      acceptTerms: z
        .boolean()
        .refine((val) => val === true, t("auth.validation.acceptTerms")),
      acceptMarketing: z.boolean().optional(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("auth.validation.passwordsMatch"),
      path: ["confirmPassword"],
    });
}

export type SignupFormData = z.infer<ReturnType<typeof makeSignupSchema>>;
