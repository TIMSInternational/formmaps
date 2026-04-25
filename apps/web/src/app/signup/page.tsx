"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import { signUp as signUpApi, login as loginApi } from "@/services/authService";
import { getRoleByName } from "@/services/roleService";
import { useRouter } from "next/navigation";
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

const signupSchema = z
  .object({
    firstName: z
      .string()
      .min(1, "First name is required")
      .min(2, "First name must be at least 2 characters"),
    lastName: z
      .string()
      .min(1, "Last name is required")
      .min(2, "Last name must be at least 2 characters"),
    email: z
      .string()
      .min(1, "Email is required")
      .email("Please enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    acceptTerms: z
      .boolean()
      .refine(
        (val) => val === true,
        "You must accept the terms and conditions"
      ),
    acceptMarketing: z.boolean().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SignupFormData = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const { t } = useTranslation();
  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
      acceptMarketing: false,
    },
  });

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { setUser } = useGlobalStore();
  const {
    handleSubmit,
    control,
    watch,
    formState: { errors, isValid },
  } = form;
  const router = useRouter();

  const password = watch("password");

  const validatePassword = (password: string) => {
    return {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    };
  };

  const getPasswordStrength = (password: string) => {
    if (!password) return { strength: 0, label: "", color: "" };

    const validation = validatePassword(password);
    const { length, uppercase, lowercase, number, special } = validation;

    // Define strength levels
    const levels = [
      { strength: 0, label: "", color: "" },
      { strength: 1, label: "Very Weak", color: "bg-red-500" },
      { strength: 2, label: "Weak", color: "bg-orange-500" },
      { strength: 3, label: "Fair", color: "bg-yellow-500" },
      { strength: 4, label: "Good", color: "bg-blue-500" },
      { strength: 5, label: "Strong", color: "bg-green-500" },
    ];

    let score = 0;
    if (!length) {
      score = 0;
    } else if (!(uppercase && lowercase && number)) {
      // If missing core criteria (uppercase, lowercase, number), only consider length and special character
      score = 1 + (special ? 1 : 0);
    } else {
      // Core criteria met (length + uppercase + lowercase + number) = score 4
      // Special character adds +1 for score 5
      score = 4 + (special ? 1 : 0);
    }

    // Ensure score is within levels range
    const index = Math.min(score, levels.length - 1);
    return levels[index];
  };

  const handleSubmitForm = async (data: SignupFormData) => {
    setIsLoading(true);

    try {
      // Get the default user role
      let userRoleId = "686cc04c1237a82fc74b4a6a"; // fallback roleId
      try {
        const userRole = await getRoleByName("User");
        userRoleId = userRole.id;
      } catch (roleError) {
        // If 'User' role doesn't exist, try 'Student'
        try {
          const studentRole = await getRoleByName("Student");
          userRoleId = studentRole.id;
        } catch {
          // Use fallback roleId if both fail
        }
      }

      await signUpApi(
        `${data.firstName} ${data.lastName}`,
        data.email,
        data.password
        // userRoleId
      );

      // on signup success, call login to get token
      const loginRes = await loginApi(data.email, data.password);
      localStorage.setItem("token", loginRes.token);

      // Extract role name from login response
      const roleName = loginRes.user?.role?.name || null;

      setUser({
        id: loginRes.user?.id || "",
        email: data.email,
        name: `${data.firstName} ${data.lastName}`,
        role: roleName,
        isAuthenticated: true,
      });
      router.push("/dashboard");
    } catch (err: any) {
      // Handle API errors based on the response structure
      if (err.response?.data?.errors) {
        const apiErrors = err.response.data.errors;
        // Map API field errors to form fields
        Object.keys(apiErrors).forEach((field) => {
          const messages = Array.isArray(apiErrors[field])
            ? apiErrors[field]
            : [apiErrors[field]];
          const message = messages[0]; // Use first error message

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
              // If roleId error, show a general message
              form.setError("email", {
                message: "Registration failed. Please try again.",
              });
              break;
            default:
              form.setError("email", { message });
          }
        });
      } else if (err.response?.data?.message) {
        // Handle single error message
        form.setError("email", { message: err.response.data.message });
      } else {
        // Handle generic errors
        form.setError("email", {
          message:
            err.message || "An error occurred during signup. Please try again.",
        });
      }
    }
    setIsLoading(false);
  };

  const passwordStrength = getPasswordStrength(password || "");

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-100">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
            radial-gradient(circle at 20% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(99, 102, 241, 0.1) 0%, transparent 50%),
            linear-gradient(135deg, transparent 30%, rgba(147, 51, 234, 0.05) 50%, transparent 70%)
          `,
          }}
        />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23a855f7' fill-opacity='0.03'%3E%3Cpath d='M20 20c0-11.046 8.954-20 20-20v20H20z'/%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Left Panel - Clean Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-900" />

        {/* Simple decorative elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-32 right-16 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-32 left-16 w-48 h-48 bg-purple-400/10 rounded-full blur-2xl" />
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
              Start your career
              <br />
              <span className="text-purple-300">transformation today</span>
            </h1>
            <p className="text-xl text-slate-300 mb-8 leading-relaxed">
              Join thousands of professionals who've accelerated their careers
              with our AI-powered platform.
            </p>

            <div className="space-y-4">
              {[
                { icon: "🚀", text: "Build professional resumes in minutes" },
                { icon: "🎯", text: "Get matched with perfect opportunities" },
                { icon: "💼", text: "Access expert career coaching" },
                { icon: "📈", text: "Track your professional growth" },
                { icon: "🤝", text: "Connect with industry mentors" },
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

      {/* Right Panel - Signup Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md relative"
        >
          {/* Glassmorphism Card */}
          <div className="relative bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
            {/* Subtle glow effect */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-purple-500/5 to-blue-500/5 blur-xl" />

            <div className="relative">
              {/* Mobile Logo */}
              <div className="lg:hidden flex items-center justify-center space-x-2 mb-6">
                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">U</span>
                </div>
                <span className="text-xl font-bold text-gray-900">
                  UNIV.365
                </span>
              </div>

              <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {t("auth.signup.title")}
                </h1>
                <p className="text-gray-600">{t("auth.signup.subtitle")}</p>
              </div>

              <Form {...form}>
                <form
                  onSubmit={handleSubmit(handleSubmitForm)}
                  className="space-y-5"
                >
                  {/* Name Fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel
                            htmlFor="firstName"
                            className="text-sm font-medium text-gray-700"
                          >
                            First name
                          </FormLabel>
                          <FormControl>
                            <Input
                              id="firstName"
                              type="text"
                              {...field}
                              placeholder={t('auth.signup.firstNamePlaceholder')}
                              className={cn(
                                "h-11 text-base bg-white/50 backdrop-blur-sm border-gray-200/50 focus:border-purple-500 focus:ring-purple-500/20",
                                errors.firstName &&
                                  "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                              )}
                            />
                          </FormControl>
                          <FormMessage className="text-xs text-red-600" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel
                            htmlFor="lastName"
                            className="text-sm font-medium text-gray-700"
                          >
                            Last name
                          </FormLabel>
                          <FormControl>
                            <Input
                              id="lastName"
                              type="text"
                              {...field}
                              placeholder={t('auth.signup.lastNamePlaceholder')}
                              className={cn(
                                "h-11 text-base bg-white/50 backdrop-blur-sm border-gray-200/50 focus:border-purple-500 focus:ring-purple-500/20",
                                errors.lastName &&
                                  "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                              )}
                            />
                          </FormControl>
                          <FormMessage className="text-xs text-red-600" />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Email */}
                  <FormField
                    control={control}
                    name="email"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel
                          htmlFor="email"
                          className="text-sm font-medium text-gray-700"
                        >
                          Email address
                        </FormLabel>
                        <FormControl>
                          <Input
                            id="email"
                            type="email"
                            {...field}
                            placeholder={t('auth.signup.emailPlaceholder')}
                            className={cn(
                              "h-11 text-base bg-white/50 backdrop-blur-sm border-gray-200/50 focus:border-purple-500 focus:ring-purple-500/20",
                              errors.email &&
                                "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                            )}
                          />
                        </FormControl>
                        <FormMessage className="text-xs text-red-600" />
                      </FormItem>
                    )}
                  />

                  {/* Password */}
                  <FormField
                    control={control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel
                          htmlFor="password"
                          className="text-sm font-medium text-gray-700"
                        >
                          Password
                        </FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              id="password"
                              type={showPassword ? "text" : "password"}
                              {...field}
                              placeholder="Create a strong password"
                              className={cn(
                                "h-11 text-base bg-white/50 backdrop-blur-sm border-gray-200/50 focus:border-purple-500 focus:ring-purple-500/20 pr-12",
                                errors.password &&
                                  "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                              )}
                            />
                          </FormControl>
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
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

                        {/* Password Strength Indicator */}
                        {form.getValues("password") && (
                          <div className="space-y-2">
                            <div className="flex space-x-1">
                              {[1, 2, 3, 4, 5].map((level) => (
                                <div
                                  key={level}
                                  className={cn(
                                    "h-1 flex-1 rounded-full transition-colors",
                                    level <= passwordStrength.strength
                                      ? passwordStrength.color
                                      : "bg-gray-200"
                                  )}
                                />
                              ))}
                            </div>
                            {passwordStrength.label && (
                              <p className="text-xs text-gray-600">
                                Password strength:{" "}
                                <span className="font-medium">
                                  {passwordStrength.label}
                                </span>
                              </p>
                            )}
                          </div>
                        )}
                        <FormMessage className="text-xs text-red-600" />
                      </FormItem>
                    )}
                  />

                  {/* Confirm Password */}
                  <FormField
                    control={control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel
                          htmlFor="confirmPassword"
                          className="text-sm font-medium text-gray-700"
                        >
                          Confirm password
                        </FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              id="confirmPassword"
                              type={showConfirmPassword ? "text" : "password"}
                              {...field}
                              placeholder="Confirm your password"
                              className={cn(
                                "h-11 text-base bg-white/50 backdrop-blur-sm border-gray-200/50 focus:border-purple-500 focus:ring-purple-500/20 pr-12",
                                errors.confirmPassword &&
                                  "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                              )}
                            />
                          </FormControl>
                          <button
                            type="button"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {showConfirmPassword ? (
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
                        <FormMessage className="text-xs text-red-600" />
                      </FormItem>
                    )}
                  />

                  {/* Terms and Marketing */}
                  <div className="space-y-3">
                    <div className="flex items-start space-x-2">
                      <input
                        id="terms"
                        type="checkbox"
                        {...form.register("acceptTerms")}
                        className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 mt-0.5"
                      />
                      <Label
                        htmlFor="terms"
                        className="text-sm text-gray-700 leading-5"
                      >
                        I agree to the{" "}
                        <Link
                          href="/terms"
                          className="text-purple-600 hover:text-purple-500 font-medium"
                        >
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link
                          href="/privacy"
                          className="text-purple-600 hover:text-purple-500 font-medium"
                        >
                          Privacy Policy
                        </Link>
                      </Label>
                    </div>
                    {errors.acceptTerms && (
                      <p className="text-xs text-red-600 ml-6">
                        {errors.acceptTerms.message}
                      </p>
                    )}

                    <div className="flex items-start space-x-2">
                      <input
                        id="marketing"
                        type="checkbox"
                        {...form.register("acceptMarketing")}
                        className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 mt-0.5"
                      />
                      <Label
                        htmlFor="marketing"
                        className="text-sm text-gray-700 leading-5"
                      >
                        I'd like to receive career tips and product updates via
                        email
                      </Label>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium rounded-xl shadow-lg disabled:opacity-50 transition-all duration-200"
                  >
                    {isLoading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>{t("auth.signup.creating")}</span>
                      </div>
                    ) : (
                      t("auth.signup.submit")
                    )}
                  </Button>
                </form>
              </Form>

              <p className="mt-6 text-center text-sm text-gray-600">
                {t("auth.login.noAccountText")}{" "}
                <Link
                  href="/login"
                  className="font-medium text-purple-600 hover:text-purple-500 transition-colors"
                >
                  {t("auth.login.submit")}
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
