"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { normalizeRole, roleHomeMap } from "@/lib/roleUtils";
import { Roles } from "@/lib/permissions";
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
  const rawRedirect = searchParams.get("redirect") || "/dashboard";
  const SAFE_PREFIXES = ["/dashboard", "/counselor", "/admin", "/school-admin", "/parent", "/careers", "/evaluation", "/subscribe"];
  const defaultRedirect = (rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && SAFE_PREFIXES.some(p => rawRedirect.startsWith(p))) ? rawRedirect : "/dashboard";

  const onSubmit = async (data: LoginFormData) => {
    setApiError(null);
    try {
      const response = await loginApi(data.email, data.password);
      if (!response.token) throw new Error("No token received from server");

      const roleName = response.user?.role?.name || null;

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
      // ALWAYS use roleHomeMap for the user's role — ignore redirect param
      // for non-students to prevent sending admins to student pages
      const roleHome = roleHomeMap[normalized];
      const redirectTo = normalized === Roles.STUDENT
        ? (defaultRedirect !== "/dashboard" ? defaultRedirect : roleHome)
        : roleHome;

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
      {/* Left Panel — Branding */}
      <div
        className="hidden lg:flex lg:w-[48%] relative overflow-hidden"
        style={{ background: "#065292" }}
      >
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col justify-center px-16 relative z-10"
        >
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <img src="/logo-icon.svg" alt="FormMaps" className="w-12 h-12" style={{ filter: "brightness(0) invert(1)" }} />
            <div>
              <span className="text-2xl font-bold text-white tracking-tight">FORM</span>
              <span className="text-2xl font-bold tracking-tight" style={{ color: "#FFD600" }}>MAPS</span>
            </div>
          </div>

          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Find your path.
            <br />
            <span style={{ color: "#FFD600" }}>Shape your future.</span>
          </h1>
          <p className="text-base mb-10" style={{ color: "rgba(255,255,255,0.75)", maxWidth: 420, lineHeight: 1.7 }}>
            AI-powered college counseling and career guidance platform for students, counselors, and schools.
          </p>

          <div className="flex flex-col gap-4">
            {[
              { icon: "graduation", text: "College admission predictions" },
              { icon: "compass", text: "Career pathway discovery" },
              { icon: "chart", text: "AI-powered student insights" },
              { icon: "shield", text: "Secure school administration" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#FFD600" }} />
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>{item.text}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Decorative circle */}
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full" style={{ background: "rgba(255,214,0,0.08)" }} />
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>

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
