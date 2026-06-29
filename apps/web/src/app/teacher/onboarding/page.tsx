"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  BookOpen,
  School,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useVerifyTeacherToken, useCompleteTeacherOnboarding } from "@/hooks/useTeacherPortalQueries";
import { useGlobalStore } from "@/store/useGlobalStore";

function TeacherOnboardingContent() {
  const { t } = useTranslation("teacher");
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const { setUser } = useGlobalStore();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const {
    data: tokenData,
    isLoading: verifying,
    isError: tokenInvalid,
    error: tokenError,
  } = useVerifyTeacherToken(token);

  const complete = useCompleteTeacherOnboarding();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error(t("onboarding.validation.nameRequired"));
      return;
    }
    if (password.length < 8) {
      toast.error(t("onboarding.validation.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("onboarding.validation.passwordMismatch"));
      return;
    }

    complete.mutate(
      {
        token,
        password,
        name: name.trim(),
      },
      {
        onSuccess: (result) => {
          // Backend set auth cookies; mirror login so the Bearer fallback + store are in sync.
          setUser({
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.roleName,
            accessToken: result.token,
            permissions: result.user.permissions,
            isAuthenticated: true,
          });
          setDone(true);
          setTimeout(() => router.push("/teacher"), 2000);
        },
        onError: (err: Error) =>
          toast.error(err.message || t("onboarding.validation.setupFailed")),
      }
    );
  };

  // No token
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="pt-10 pb-8 text-center">
            <AlertTriangle className="h-12 w-12 text-orange-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {t("onboarding.states.noToken.title")}
            </h2>
            <p className="text-gray-500 text-sm">
              {t("onboarding.states.noToken.message")}
            </p>
            <Link href="/login" className="mt-6 inline-block">
              <Button variant="outline">{t("onboarding.states.noToken.goToLogin")}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verifying
  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="space-y-4 text-center">
          <Loader2 className="h-10 w-10 mx-auto animate-spin" style={{ color: "#065292" }} />
          <p className="text-gray-500">{t("onboarding.states.verifying")}</p>
        </div>
      </div>
    );
  }

  // Token invalid or expired
  if (tokenInvalid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="pt-10 pb-8 text-center">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {t("onboarding.states.expired.title")}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {(tokenError as Error)?.message ??
                t("onboarding.states.expired.fallbackMessage")}
            </p>
            <Link href="/login">
              <Button variant="outline">{t("onboarding.states.expired.goToLogin")}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success
  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="max-w-md w-full border-0 shadow-xl text-center">
            <CardContent className="pt-10 pb-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
              >
                <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {t("onboarding.states.success.title")}
              </h2>
              <p className="text-gray-500 text-sm">
                {t("onboarding.states.success.message")}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg space-y-6"
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto shadow-lg" style={{ background: "#065292" }}>
            <BookOpen className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("onboarding.title")}
          </h1>
          <p className="text-gray-500 text-sm">
            {t("onboarding.subtitle")}
          </p>
        </div>

        {/* Invite Details */}
        {tokenData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border shadow-md" style={{ borderColor: "rgba(6,82,146,0.20)", background: "rgba(6,82,146,0.04)" }}>
              <CardContent className="pt-4 pb-4">
                <div className="flex flex-wrap gap-x-6 gap-y-3 items-center">
                  <div className="flex items-center gap-2">
                    <School className="h-4 w-4" style={{ color: "#065292" }} />
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                        {t("onboarding.inviteDetails.schoolLabel")}
                      </p>
                      <p className="text-sm font-semibold text-gray-800">
                        {tokenData.schoolName ?? t("onboarding.inviteDetails.schoolFallback")}
                      </p>
                    </div>
                  </div>

                  {tokenData.email && (
                    <Badge className="self-center" style={{ background: "rgba(6,82,146,0.12)", color: "#065292", borderColor: "rgba(6,82,146,0.20)" }}>
                      {tokenData.email}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Form */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">{t("onboarding.form.cardTitle")}</CardTitle>
            <CardDescription>
              {t("onboarding.form.cardDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  {t("onboarding.form.fullName.label")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("onboarding.form.fullName.placeholder")}
                  required
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">
                  {t("onboarding.form.password.label")} <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("onboarding.form.password.placeholder")}
                    required
                    minLength={8}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirm">
                  {t("onboarding.form.confirmPassword.label")} <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("onboarding.form.confirmPassword.placeholder")}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowConfirm((v) => !v)}
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500">
                    {t("onboarding.form.confirmPassword.mismatch")}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={
                  complete.isPending ||
                  !name.trim() ||
                  !password ||
                  !confirmPassword ||
                  password !== confirmPassword
                }
                className="w-full text-white h-11 mt-2"
                style={{ background: "#065292" }}
              >
                {complete.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                {t("onboarding.form.submit")}
              </Button>

              <p className="text-xs text-center text-gray-400 pt-1">
                {t("onboarding.form.signInPrompt")}{" "}
                <Link href="/login" style={{ color: "#065292" }} className="hover:underline">
                  {t("onboarding.form.signInLink")}
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default function TeacherOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-blue-50 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#065292" }} />
        </div>
      }
    >
      <TeacherOnboardingContent />
    </Suspense>
  );
}
