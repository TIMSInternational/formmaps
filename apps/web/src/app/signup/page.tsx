"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { signUp as signUpApi, login as loginApi } from "@/services/authService";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { makeSignupSchema, type SignupFormData } from "./_components/signupSchema";
import { PasswordInput } from "./_components/PasswordInput";
import { AuthBrandingPanel } from "@/components/auth/AuthBrandingPanel";

const inputStyle = { background: "#F8F9FA", borderColor: "#E0E0E0", color: "#111" } as const;
const focusOn = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = "#065292"; };
const focusOff = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = "#E0E0E0"; };

export default function SignupPage() {
  const { t } = useTranslation();
  const signupSchema = useMemo(() => makeSignupSchema(t), [t]);
  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      dateOfBirth: "",
      acceptTerms: false,
      acceptMarketing: false,
    },
  });

  const [isLoading, setIsLoading] = useState(false);
  const { setUser } = useGlobalStore();
  const {
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = form;
  const router = useRouter();
  const password = watch("password");

  const handleSubmitForm = async (data: SignupFormData) => {
    setIsLoading(true);

    try {
      // No role lookup: those endpoints require auth (401 for anonymous users)
      // and the backend signup defaults to the Student role when roleId is omitted.
      await signUpApi(
        `${data.firstName} ${data.lastName}`,
        data.email,
        data.password,
        undefined,
        data.dateOfBirth,
        data.acceptMarketing
      );

      const loginRes = await loginApi(data.email, data.password);
      const roleName = loginRes.user?.role?.name || null;

      setUser({
        id: loginRes.user?.id || "",
        email: data.email,
        name: `${data.firstName} ${data.lastName}`,
        role: roleName,
        isAuthenticated: true,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { errors?: Record<string, string | string[]>; message?: string } }; message?: string };
      if (error.response?.data?.errors) {
        const apiErrors = error.response.data.errors;
        Object.keys(apiErrors).forEach((field) => {
          const messages = Array.isArray(apiErrors[field])
            ? apiErrors[field]
            : [apiErrors[field]];
          const message = messages[0];

          switch (field.toLowerCase()) {
            case "email":
              form.setError("email", { message });
              break;
            case "password":
              form.setError("password", { message });
              break;
            case "name":
              form.setError("firstName", { message });
              break;
            case "roleid":
              form.setError("email", {
                message: t("auth.errors.registrationFailed"),
              });
              break;
            default:
              form.setError("email", { message });
          }
        });
      } else if (error.response?.data?.message) {
        form.setError("email", { message: error.response.data.message });
      } else {
        form.setError("email", {
          message:
            error.message || t("auth.errors.genericSignup"),
        });
      }
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-dvh flex" style={{ fontFamily: "var(--font-poppins), Poppins, sans-serif" }}>
      {/* Left Panel — Branding (shared with login) */}
      <AuthBrandingPanel />

      {/* Right Panel — Signup Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12" style={{ background: "#FFFFFF" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.svg" alt="FormMaps" className="w-10 h-10" />
            <div>
              <span className="text-xl font-bold" style={{ color: "#111111" }}>FORM</span>
              <span className="text-xl font-bold" style={{ color: "#065292" }}>MAPS</span>
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold mb-2" style={{ color: "#111111" }}>
              {t("auth.signup.title")}
            </h1>
            <p className="text-sm" style={{ color: "#666" }}>{t("auth.signup.subtitle")}</p>
          </div>

          <Form {...form}>
            <form onSubmit={handleSubmit(handleSubmitForm)} className="flex flex-col gap-5">
              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-1.5">
                      <FormLabel htmlFor="firstName" className="text-xs font-medium" style={{ color: "#333" }}>{t("auth.signup.firstNameLabel")}</FormLabel>
                      <FormControl>
                        <input id="firstName" type="text" {...field} placeholder={t("auth.signup.firstNamePlaceholder")}
                          className="h-11 px-3 text-sm rounded-lg border outline-none transition-colors w-full"
                          style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
                      </FormControl>
                      <FormMessage className="text-xs text-red-500" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-1.5">
                      <FormLabel htmlFor="lastName" className="text-xs font-medium" style={{ color: "#333" }}>{t("auth.signup.lastNameLabel")}</FormLabel>
                      <FormControl>
                        <input id="lastName" type="text" {...field} placeholder={t("auth.signup.lastNamePlaceholder")}
                          className="h-11 px-3 text-sm rounded-lg border outline-none transition-colors w-full"
                          style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
                      </FormControl>
                      <FormMessage className="text-xs text-red-500" />
                    </FormItem>
                  )}
                />
              </div>

              {/* Email */}
              <FormField
                control={control}
                name="email"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel htmlFor="email" className="text-xs font-medium" style={{ color: "#333" }}>{t("auth.signup.emailLabel")}</FormLabel>
                    <FormControl>
                      <input id="email" type="email" {...field} placeholder={t("auth.signup.emailPlaceholder")}
                        className="h-11 px-3 text-sm rounded-lg border outline-none transition-colors w-full"
                        style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
                    </FormControl>
                    <FormMessage className="text-xs text-red-500" />
                  </FormItem>
                )}
              />

              {/* Date of birth (13+ age gate) */}
              <FormField
                control={control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel htmlFor="dateOfBirth" className="text-xs font-medium" style={{ color: "#333" }}>{t("auth.signup.dobLabel")}</FormLabel>
                    <FormControl>
                      <input id="dateOfBirth" type="date" {...field} max={new Date().toISOString().split("T")[0]}
                        className="h-11 px-3 text-sm rounded-lg border outline-none transition-colors w-full"
                        style={inputStyle} onFocus={focusOn} onBlur={focusOff} />
                    </FormControl>
                    <p className="text-[11px]" style={{ color: "#999" }}>{t("auth.signup.ageNotice")}</p>
                    <FormMessage className="text-xs text-red-500" />
                  </FormItem>
                )}
              />

              {/* Password */}
              <PasswordInput control={control} name="password" label={t("auth.signup.passwordLabel")}
                placeholder={t("auth.signup.passwordPlaceholder")} showStrength currentPassword={password} />

              {/* Confirm Password */}
              <PasswordInput control={control} name="confirmPassword" label={t("auth.signup.confirmPasswordLabel")}
                placeholder={t("auth.signup.confirmPasswordPlaceholder")} />

              {/* Terms */}
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <input id="terms" type="checkbox" {...form.register("acceptTerms")}
                    className="w-3.5 h-3.5 mt-0.5" style={{ accentColor: "#065292" }} />
                  <label htmlFor="terms" className="text-xs leading-5" style={{ color: "#666" }}>
                    {t("auth.signup.agreePrefix")}{" "}
                    <Link href="/terms" className="font-medium no-underline" style={{ color: "#065292" }}>{t("auth.signup.termsOfService")}</Link>{" "}
                    {t("auth.signup.and")}{" "}
                    <Link href="/privacy" className="font-medium no-underline" style={{ color: "#065292" }}>{t("auth.signup.privacyPolicy")}</Link>
                  </label>
                </div>
                {errors.acceptTerms && (
                  <p className="text-xs text-red-500 ml-6">{errors.acceptTerms.message}</p>
                )}
                <div className="flex items-start gap-2">
                  <input id="marketing" type="checkbox" {...form.register("acceptMarketing")}
                    className="w-3.5 h-3.5 mt-0.5" style={{ accentColor: "#065292" }} />
                  <label htmlFor="marketing" className="text-xs leading-5" style={{ color: "#666" }}>
                    {t("auth.signup.marketingOptIn")}
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="h-11 rounded-lg border-none text-sm font-semibold cursor-pointer transition-all"
                style={{ background: "#065292", color: "#FFFFFF", opacity: isLoading ? 0.6 : 1 }}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t("auth.signup.creating")}
                  </span>
                ) : (
                  t("auth.signup.submit")
                )}
              </button>
            </form>
          </Form>

          <p className="mt-8 text-center text-sm" style={{ color: "#666" }}>
            {t("auth.signup.haveAccountText")}{" "}
            <Link href="/login" className="font-medium no-underline" style={{ color: "#065292" }}>
              {t("auth.signup.signIn")}
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
