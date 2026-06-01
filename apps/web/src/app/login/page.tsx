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
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        background: "#1d1d1d",
        fontFamily: "Inter, -apple-system, system-ui, sans-serif",
      }}
    >
      {/* Left Panel — Branding */}
      <div
        className="hidden lg:flex lg:w-[45%]"
        style={{
          background: "#171717",
          borderRight: "1px solid #282828",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 64px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "linear-gradient(135deg, #8b5a6b, #4a3040)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 18, fontWeight: 700,
            }}>N</div>
            <span style={{ fontSize: 24, fontWeight: 700, color: "#ebebeb", letterSpacing: "-0.02em" }}>
              FormMaps
            </span>
          </div>

          <h1 style={{ fontSize: 36, fontWeight: 700, color: "#ebebeb", lineHeight: 1.2, marginBottom: 16, letterSpacing: "-0.02em" }}>
            Welcome back to
            <br />
            <span style={{ color: "#818181" }}>your career journey</span>
          </h1>
          <p style={{ fontSize: 15, color: "#666", lineHeight: 1.6, maxWidth: 400, marginBottom: 40 }}>
            Continue building your professional future with AI-powered tools
            and personalized guidance.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { text: "AI-powered resume builder" },
              { text: "Personalized career matching" },
              { text: "Expert coaching & mentorship" },
              { text: "Real-time progress tracking" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <div style={{
                  width: 6, height: 6, borderRadius: 3,
                  background: "#3b82f6", flexShrink: 0,
                }} />
                <span style={{ fontSize: 14, color: "#b3b3b3" }}>{item.text}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right Panel — Login Form */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "48px 24px",
      }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ width: "100%", maxWidth: 400 }}
        >
          {/* Mobile Logo */}
          <div className="lg:hidden" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 40 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(135deg, #8b5a6b, #4a3040)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 14, fontWeight: 700,
            }}>N</div>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#ebebeb" }}>FormMaps</span>
          </div>

          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: "#ebebeb", marginBottom: 8 }}>
              {t("auth.login.title")}
            </h1>
            <p style={{ fontSize: 13, color: "#818181" }}>{t("auth.login.subtitle")}</p>
          </div>

          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Email */}
              <FormField
                control={control}
                name="email"
                render={({ field }) => (
                  <FormItem style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <FormLabel style={{ fontSize: 12, fontWeight: 500, color: "#b3b3b3" }}>
                      {t("auth.login.emailLabel")}
                    </FormLabel>
                    <FormControl>
                      <input
                        type="email"
                        placeholder={t("auth.login.emailPlaceholder")}
                        {...field}
                        style={{
                          height: 40, padding: "0 12px", fontSize: 13,
                          background: "#1e1e1e", border: "1px solid #2a2a2a",
                          borderRadius: 6, color: "#ebebeb", outline: "none",
                          width: "100%",
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "#555"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                      />
                    </FormControl>
                    <FormMessage style={{ fontSize: 12, color: "#ef4444" }} />
                  </FormItem>
                )}
              />

              {/* Password */}
              <FormField
                control={control}
                name="password"
                render={({ field }) => (
                  <FormItem style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <FormLabel style={{ fontSize: 12, fontWeight: 500, color: "#b3b3b3" }}>
                        {t("auth.login.passwordLabel")}
                      </FormLabel>
                      <Link href="/forgot-password" style={{ fontSize: 12, color: "#818181", textDecoration: "none" }}>
                        Forgot password?
                      </Link>
                    </div>
                    <div style={{ position: "relative" }}>
                      <FormControl>
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder={t("auth.login.passwordPlaceholder")}
                          {...field}
                          style={{
                            height: 40, padding: "0 40px 0 12px", fontSize: 13,
                            background: "#1e1e1e", border: "1px solid #2a2a2a",
                            borderRadius: 6, color: "#ebebeb", outline: "none",
                            width: "100%",
                          }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = "#555"; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                        />
                      </FormControl>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                          background: "transparent", border: "none", cursor: "pointer",
                          color: "#818181", display: "flex", alignItems: "center",
                        }}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                      </button>
                    </div>
                    <FormMessage style={{ fontSize: 12, color: "#ef4444" }} />
                  </FormItem>
                )}
              />

              {/* Remember Me */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  id="remember"
                  type="checkbox"
                  style={{ width: 14, height: 14, accentColor: "#3b82f6" }}
                />
                <label htmlFor="remember" style={{ fontSize: 12, color: "#818181" }}>
                  {t("auth.login.remember")}
                </label>
              </div>

              {apiError && <AuthErrorMessage message={apiError} />}

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  height: 40, borderRadius: 6, border: "none",
                  background: "#ebebeb", color: "#171717",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  opacity: isSubmitting ? 0.5 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {isSubmitting ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <div style={{ width: 14, height: 14, border: "2px solid #171717", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
                    {t("auth.login.submitting")}
                  </span>
                ) : (
                  t("auth.login.submit")
                )}
              </button>
            </form>
          </Form>

          <p style={{ marginTop: 32, textAlign: "center", fontSize: 13, color: "#818181" }}>
            {t("auth.login.noAccountText")}{" "}
            <Link href="/signup" style={{ color: "#ebebeb", fontWeight: 500, textDecoration: "none" }}>
              {t("auth.login.signUp")}
            </Link>
          </p>
        </motion.div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
