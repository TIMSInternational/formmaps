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
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { signupSchema, type SignupFormData } from "./_components/signupSchema";
import { SignupBrandingPanel } from "./_components/SignupBrandingPanel";
import { PasswordInput } from "./_components/PasswordInput";

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
      let userRoleId = "686cc04c1237a82fc74b4a6a";
      try {
        const userRole = await getRoleByName("User");
        userRoleId = userRole.id;
      } catch {
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
                message: "Registration failed. Please try again.",
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
            error.message || "An error occurred during signup. Please try again.",
        });
      }
    }
    setIsLoading(false);
  };

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
      <SignupBrandingPanel />

      {/* Right Panel - Signup Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-8 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md relative"
        >
          <div className="relative bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-purple-500/5 to-blue-500/5 blur-xl" />

            <div className="relative">
              {/* Mobile Logo */}
              <div className="lg:hidden flex items-center justify-center space-x-2 mb-6">
                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">U</span>
                </div>
                <span className="text-xl font-bold text-gray-900">UNIV.365</span>
              </div>

              <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {t("auth.signup.title")}
                </h1>
                <p className="text-gray-600">{t("auth.signup.subtitle")}</p>
              </div>

              <Form {...form}>
                <form onSubmit={handleSubmit(handleSubmitForm)} className="space-y-5">
                  {/* Name Fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel htmlFor="firstName" className="text-sm font-medium text-gray-700">First name</FormLabel>
                          <FormControl>
                            <Input id="firstName" type="text" {...field} placeholder={t('auth.signup.firstNamePlaceholder')}
                              className={cn("h-11 text-base bg-white/50 backdrop-blur-sm border-gray-200/50 focus:border-purple-500 focus:ring-purple-500/20",
                                errors.firstName && "border-red-300 focus:border-red-500 focus:ring-red-500/20")} />
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
                          <FormLabel htmlFor="lastName" className="text-sm font-medium text-gray-700">Last name</FormLabel>
                          <FormControl>
                            <Input id="lastName" type="text" {...field} placeholder={t('auth.signup.lastNamePlaceholder')}
                              className={cn("h-11 text-base bg-white/50 backdrop-blur-sm border-gray-200/50 focus:border-purple-500 focus:ring-purple-500/20",
                                errors.lastName && "border-red-300 focus:border-red-500 focus:ring-red-500/20")} />
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
                        <FormLabel htmlFor="email" className="text-sm font-medium text-gray-700">Email address</FormLabel>
                        <FormControl>
                          <Input id="email" type="email" {...field} placeholder={t('auth.signup.emailPlaceholder')}
                            className={cn("h-11 text-base bg-white/50 backdrop-blur-sm border-gray-200/50 focus:border-purple-500 focus:ring-purple-500/20",
                              errors.email && "border-red-300 focus:border-red-500 focus:ring-red-500/20")} />
                        </FormControl>
                        <FormMessage className="text-xs text-red-600" />
                      </FormItem>
                    )}
                  />

                  {/* Password */}
                  <PasswordInput control={control} errors={errors} name="password" label="Password"
                    placeholder="Create a strong password" showStrength currentPassword={password} />

                  {/* Confirm Password */}
                  <PasswordInput control={control} errors={errors} name="confirmPassword" label="Confirm password"
                    placeholder="Confirm your password" />

                  {/* Terms and Marketing */}
                  <div className="space-y-3">
                    <div className="flex items-start space-x-2">
                      <input id="terms" type="checkbox" {...form.register("acceptTerms")}
                        className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 mt-0.5" />
                      <Label htmlFor="terms" className="text-sm text-gray-700 leading-5">
                        I agree to the{" "}
                        <Link href="/terms" className="text-purple-600 hover:text-purple-500 font-medium">Terms of Service</Link>{" "}
                        and{" "}
                        <Link href="/privacy" className="text-purple-600 hover:text-purple-500 font-medium">Privacy Policy</Link>
                      </Label>
                    </div>
                    {errors.acceptTerms && (
                      <p className="text-xs text-red-600 ml-6">{errors.acceptTerms.message}</p>
                    )}
                    <div className="flex items-start space-x-2">
                      <input id="marketing" type="checkbox" {...form.register("acceptMarketing")}
                        className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 mt-0.5" />
                      <Label htmlFor="marketing" className="text-sm text-gray-700 leading-5">
                        I&apos;d like to receive career tips and product updates via email
                      </Label>
                    </div>
                  </div>

                  <Button type="submit" disabled={isLoading}
                    className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium rounded-xl shadow-lg disabled:opacity-50 transition-all duration-200">
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
                <Link href="/login" className="font-medium text-purple-600 hover:text-purple-500 transition-colors">
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
