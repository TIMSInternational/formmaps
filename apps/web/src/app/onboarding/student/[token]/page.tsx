"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useGlobalStore } from "@/store/useGlobalStore";
import { cn } from "@/lib/utils";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  verifyStudentToken,
  completeStudentOnboarding,
} from "@/services/studentOnboardingService";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// Password validation schema
const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type PasswordFormData = z.infer<typeof passwordSchema>;

export default function StudentOnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { t } = useTranslation();
  const router = useRouter();
  const { setUser } = useGlobalStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [userId, setUserId] = useState("");
  const [errorObj, setErrorObj] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form setup
  const form = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const {
    handleSubmit,
    control,
    formState: { errors },
  } = form;

  // Verify token on mount
  useEffect(() => {
    const checkToken = async () => {
      try {
        setIsLoading(true);
        const result = await verifyStudentToken(token);
        console.log("🔍 Page received verification result:", result);

        // Handle potential string/boolean mismatch from API
        const isValidToken = result.isValid === true || result.isValid === "true";

        if (isValidToken) {
          setIsValid(true);
          setStudentName(result.student?.name || "Student");
          setUserId(result.student?.id || "");
        } else {
          setIsValid(false);
          // show more details for debugging if available
          const debugMsg = JSON.stringify(result, null, 2);
          setErrorObj(result.message || `Invalid invitation link (Debug: ${debugMsg})`);
        }
      } catch (err) {
        setIsValid(false);
        setErrorObj("Failed to verify invitation. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    checkToken();
  }, [token]);

  const onSubmit = async (data: PasswordFormData) => {
    setIsSubmitting(true);
    try {
      if (!userId) {
        throw new Error("Student ID not found. Please refresh the page.");
      }
      const result = await completeStudentOnboarding(token, data.password, data.confirmPassword, userId);

      if (result.success) {
        if (result.token) {
          // Auto-login logic
          localStorage.setItem("token", result.token);

          // Update global store
          setUser({
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.role?.name,
            isAuthenticated: true,
          });

          toast.success("Account activated successfully!");

          // Small delay for user to see success state
          setTimeout(() => {
            router.push("/dashboard");
          }, 1500);
        } else {
          // Success but no token - redirect to login
          toast.success("Account activated! Please log in.");
          setTimeout(() => {
            router.push("/login");
          }, 2000);
        }
      } else {
        throw new Error(result.message || "Activation failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to activate account");
      setIsSubmitting(false);
    }
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen flex relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-100" />
        <div className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
          <div className="w-full max-w-md relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/40">
            <div className="text-center mb-8 flex flex-col items-center">
              <Skeleton className="w-16 h-16 rounded-2xl mb-6 rotate-12" />
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-80" />
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
              <Skeleton className="h-12 w-full rounded-xl mt-8" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error State (Invalid Token)
  if (!isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Invalid Invitation
          </h2>
          <p className="text-gray-600 mb-8">
            {errorObj || "This invitation link is invalid or has expired."}
          </p>
          <Button
            onClick={() => router.push("/login")}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-12"
          >
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  // Success/Form State
  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Background Pattern (Same as Login/Signup) */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-100">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
            radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 90% 80%, rgba(168, 85, 247, 0.1) 0%, transparent 50%),
            linear-gradient(45deg, transparent 40%, rgba(79, 70, 229, 0.05) 60%, transparent 80%)
          `,
          }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md relative"
        >
          {/* Glassmorphism Card */}
          <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/40">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6 rotate-12 shadow-inner">
                <span className="text-3xl">👋</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome, {studentName.split(" ")[0]}!
              </h1>
              <p className="text-gray-600">
                Set a password to activate your account and access your student dashboard.
              </p>
            </div>

            <Form {...form}>
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-6"
              >
                {/* Password Field */}
                <FormField
                  control={control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-gray-700 font-medium">
                        Create Password
                      </FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            {...field}
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter a strong password"
                            className={cn(
                              "h-12 bg-white/60 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20 rounded-xl pr-12",
                              errors.password && "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                            )}
                          />
                        </FormControl>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showPassword ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Confirm Password Field */}
                <FormField
                  control={control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-gray-700 font-medium">
                        Confirm Password
                      </FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            {...field}
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Re-enter your password"
                            className={cn(
                              "h-12 bg-white/60 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20 rounded-xl pr-12",
                              errors.confirmPassword && "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                            )}
                          />
                        </FormControl>
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showConfirmPassword ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg transition-all duration-300 transform hover:-translate-y-0.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Activating Account...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-5 w-5" />
                      Activate Account
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </div>

          <p className="text-center text-gray-500 mt-6 text-sm">
            © {new Date().getFullYear()} UNIV.365. All rights reserved.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
