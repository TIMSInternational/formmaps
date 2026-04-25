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

// define schema
const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // initialize RHF form
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
  const defaultRedirect = searchParams.get("redirect") || "/dashboard";

  // submit handler
  const onSubmit = async (data: LoginFormData) => {
    setApiError(null);
    try {
      const response = await loginApi(data.email, data.password);

      if (!response.token) throw new Error("No token received from server");
      localStorage.setItem("token", response.token);

      // Extract role name from response
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

      // Role-based redirect
      const normalized = normalizeRole(roleName);
      const redirectTo = defaultRedirect === "/dashboard"
        ? roleHomeMap[normalized]
        : defaultRedirect;

      router.push(redirectTo);
    } catch (err: any) {
      const message =
        err.response?.data?.message ||
        err.message ||
        "Login failed. Please try again.";
      setApiError(message);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
            radial-gradient(circle at 25% 25%, rgba(99, 102, 241, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 75% 75%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
            linear-gradient(45deg, transparent 30%, rgba(59, 130, 246, 0.05) 50%, transparent 70%)
          `,
          }}
        />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236366f1' fill-opacity='0.03'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Left Panel - Clean Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-900 to-blue-900" />

        {/* Simple decorative elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-32 right-16 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-32 left-16 w-48 h-48 bg-blue-400/10 rounded-full blur-2xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-12 text-white">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex items-center space-x-3 mb-8">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <span className="text-2xl font-bold">U</span>
              </div>
              <span className="text-3xl font-bold">UNIV.365</span>
            </div>

            <h1 className="text-4xl font-bold mb-4 leading-tight">
              Welcome back to your
              <br />
              <span className="text-blue-300">career journey</span>
            </h1>
            <p className="text-xl text-slate-300 mb-8 leading-relaxed">
              Continue building your professional future with AI-powered tools
              and personalized guidance.
            </p>

            <div className="space-y-4">
              {[
                { icon: "🚀", text: "AI-powered resume builder" },
                { icon: "🎯", text: "Personalized career matching" },
                { icon: "👥", text: "Expert coaching & mentorship" },
                { icon: "📈", text: "Real-time progress tracking" },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 + index * 0.1 }}
                  className="flex items-center space-x-3"
                >
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-sm">{item.icon}</span>
                  </div>
                  <span className="text-slate-200">{item.text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md relative"
        >
          {/* Glassmorphism Card */}
          <div className="relative bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
            {/* Subtle glow effect */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-blue-500/5 to-indigo-500/5 blur-xl" />

            <div className="relative">
              {/* Mobile Logo */}
              <div className="lg:hidden flex items-center justify-center space-x-2 mb-8">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">U</span>
                </div>
                <span className="text-xl font-bold text-gray-900">
                  UNIV.365
                </span>
              </div>

              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {t("auth.login.title")}
                </h1>
                <p className="text-gray-600">{t("auth.login.subtitle")}</p>
              </div>

              <Form {...form}>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  {/* Email Field */}
                  <FormField
                    control={control}
                    name="email"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel
                          htmlFor="email"
                          className="text-sm font-medium text-gray-700"
                        >
                          {t("auth.login.emailLabel")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            id="email"
                            type="email"
                            placeholder={t("auth.login.emailPlaceholder")}
                            {...field}
                            className={cn(
                              "h-12 text-base bg-white/50 backdrop-blur-sm border-gray-200/50 focus:border-indigo-500 focus:ring-indigo-500/20",
                              errors.email &&
                              "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                            )}
                          />
                        </FormControl>
                        <FormMessage className="text-sm text-red-600" />
                      </FormItem>
                    )}
                  />

                  {/* Password Field */}
                  <FormField
                    control={control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <div className="flex items-center justify-between">
                          <FormLabel
                            htmlFor="password"
                            className="text-sm font-medium text-gray-700"
                          >
                            {t("auth.login.passwordLabel")}
                          </FormLabel>
                          <Link
                            href="/forgot-password"
                            className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
                          >
                            Forgot password?
                          </Link>
                        </div>
                        <div className="relative">
                          <FormControl>
                            <Input
                              id="password"
                              type={showPassword ? "text" : "password"}
                              placeholder={t("auth.login.passwordPlaceholder")}
                              {...field}
                              className={cn(
                                "h-12 text-base bg-white/50 backdrop-blur-sm border-gray-200/50 focus:border-indigo-500 focus:ring-indigo-500/20 pr-12",
                                errors.password &&
                                "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                              )}
                            />
                          </FormControl>
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? (
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                        <FormMessage className="text-sm text-red-600" />
                      </FormItem>
                    )}
                  />

                  {/* Remember Me */}
                  <div className="flex items-center space-x-2">
                    <input
                      id="remember"
                      type="checkbox"
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <Label htmlFor="remember" className="text-sm text-gray-700">
                      {t("auth.login.remember")}
                    </Label>
                  </div>

                  {/* API Error */}
                  {apiError && <AuthErrorMessage message={apiError} />}

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-12 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-medium rounded-xl shadow-lg disabled:opacity-50 transition-all duration-200"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>{t("auth.login.submitting")}</span>
                      </div>
                    ) : (
                      t("auth.login.submit")
                    )}
                  </Button>
                </form>
              </Form>

              <p className="mt-8 text-center text-sm text-gray-600">
                {t("auth.login.noAccountText")}{" "}
                <Link
                  href="/signup"
                  className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
                >
                  {t("auth.login.signUp")}
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
