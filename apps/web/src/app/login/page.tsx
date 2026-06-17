"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { normalizeRole } from "@/lib/roleUtils";
import { resolveLoginRedirect } from "@/lib/routePermissions";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useRouter, useSearchParams } from "next/navigation";
import { login as loginApi } from "@/services/authService";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { AuthErrorMessage } from "@/components/ui/error-message";
import { AuthBrandingPanel } from "@/components/auth/AuthBrandingPanel";
import { Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const {
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = form;

  const { setUser } = useGlobalStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");

  const onSubmit = async (data: LoginFormData) => {
    setApiError(null);
    try {
      const response = await loginApi(data.email, data.password);
      if (!response.token) throw new Error("No token received from server");

      const roleName = response.user?.roleName || response.user?.role?.name || null;

      setUser({
        id: response.user?.id || "",
        email: data.email,
        name: response.user?.name || data.email.split("@")[0],
        role: roleName,
        accessToken: response.token,
        schoolId: response.user?.schoolId || null,
        avatar: response.user?.avatarUrl || response.user?.profilePicture || response.user?.avatar || response.user?.image || null,
        permissions: response.user?.permissions || [],
        isAuthenticated: true,
      });

      const normalized = normalizeRole(roleName);
      // Honor the ?redirect= deep link when safe and role-accessible;
      // otherwise land on the role's home page.
      const redirectTo = resolveLoginRedirect(redirectParam, normalized);

      // Hard navigation to avoid race conditions with AuthWrapper's router.replace
      window.location.href = redirectTo;
    } catch (err: any) {
      const message =
        err.response?.data?.message ||
        err.message ||
        "Login failed. Please try again.";
      setApiError(message);
    }
  };

  return (
    <div className="min-h-dvh flex" style={{ fontFamily: "var(--font-poppins), Poppins, sans-serif" }}>
      {/* Left Panel — Branding (shared with signup) */}
      <AuthBrandingPanel />

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12" style={{ background: "#FFFFFF" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-10">
            <img src="/logo-icon.svg" alt="FormMaps" className="w-10 h-10" />
            <div>
              <span className="text-xl font-bold" style={{ color: "#111111" }}>FORM</span>
              <span className="text-xl font-bold" style={{ color: "#065292" }}>MAPS</span>
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold mb-2" style={{ color: "#111111" }}>
              {t("auth.login.title")}
            </h1>
            <p className="text-sm" style={{ color: "#666" }}>{t("auth.login.subtitle")}</p>
          </div>

          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
              {/* Email */}
              <FormField
                control={control}
                name="email"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-medium" style={{ color: "#333" }}>
                      {t("auth.login.emailLabel")}
                    </FormLabel>
                    <FormControl>
                      <input
                        type="email"
                        placeholder={t("auth.login.emailPlaceholder")}
                        {...field}
                        className="h-11 px-3 text-sm rounded-lg border outline-none transition-colors w-full"
                        style={{ background: "#F8F9FA", borderColor: "#E0E0E0", color: "#111" }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "#065292"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "#E0E0E0"; }}
                      />
                    </FormControl>
                    <FormMessage className="text-xs text-red-500" />
                  </FormItem>
                )}
              />

              {/* Password */}
              <FormField
                control={control}
                name="password"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <FormLabel className="text-xs font-medium" style={{ color: "#333" }}>
                        {t("auth.login.passwordLabel")}
                      </FormLabel>
                      <Link href="/forgot-password" className="text-xs no-underline" style={{ color: "#065292" }}>
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <FormControl>
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder={t("auth.login.passwordPlaceholder")}
                          {...field}
                          className="h-11 px-3 pr-10 text-sm rounded-lg border outline-none transition-colors w-full"
                          style={{ background: "#F8F9FA", borderColor: "#E0E0E0", color: "#111" }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = "#065292"; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = "#E0E0E0"; }}
                        />
                      </FormControl>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer flex items-center"
                        style={{ color: "#999" }}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <FormMessage className="text-xs text-red-500" />
                  </FormItem>
                )}
              />

              {/* Remember Me */}
              <div className="flex items-center gap-2">
                <input
                  id="remember"
                  type="checkbox"
                  className="w-3.5 h-3.5"
                  style={{ accentColor: "#065292" }}
                />
                <label htmlFor="remember" className="text-xs" style={{ color: "#666" }}>
                  {t("auth.login.remember")}
                </label>
              </div>

              {apiError && <AuthErrorMessage message={apiError} />}

              <button
                type="submit"
                disabled={isSubmitting}
                className="h-11 rounded-lg border-none text-sm font-semibold cursor-pointer transition-all"
                style={{
                  background: "#065292", color: "#FFFFFF",
                  opacity: isSubmitting ? 0.6 : 1,
                }}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t("auth.login.submitting")}
                  </span>
                ) : (
                  t("auth.login.submit")
                )}
              </button>
            </form>
          </Form>

          <p className="mt-8 text-center text-sm" style={{ color: "#666" }}>
            {t("auth.login.noAccountText")}{" "}
            <Link href="/signup" className="font-medium no-underline" style={{ color: "#065292" }}>
              {t("auth.login.signUp")}
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
