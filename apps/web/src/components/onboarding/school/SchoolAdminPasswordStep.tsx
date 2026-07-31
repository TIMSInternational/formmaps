"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, ArrowLeft, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SchoolAdminPasswordStepProps {
  value: string;
  onNext: (password: string) => void;
  onBack: () => void;
}

export function SchoolAdminPasswordStep({
  value,
  onNext,
  onBack,
}: SchoolAdminPasswordStepProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState(value || "");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const passwordRequirements = [
    {
      label: t("onboarding.password.req.length", "At least 8 characters"),
      valid: password.length >= 8,
    },
    {
      label: t("onboarding.password.req.uppercase", "One uppercase letter"),
      valid: /[A-Z]/.test(password),
    },
    {
      label: t("onboarding.password.req.lowercase", "One lowercase letter"),
      valid: /[a-z]/.test(password),
    },
    {
      label: t("onboarding.password.req.number", "One number"),
      valid: /\d/.test(password),
    },
  ];

  const isPasswordValid = passwordRequirements.every((req) => req.valid);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isPasswordValid) {
      setError(
        t(
          "onboarding.password.requirements",
          "Please meet all password requirements",
        ),
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(t("onboarding.password.noMatch", "Passwords do not match"));
      return;
    }

    onNext(password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {t("onboarding.password.label", "Password")}
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
              placeholder={t(
                "onboarding.password.placeholder",
                "Enter your password",
              )}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-1"
              aria-label={
                showPassword
                  ? t("onboarding.password.hide", "Hide password")
                  : t("onboarding.password.show", "Show password")
              }
            >
              {showPassword ? (
                <EyeOff size={20} aria-hidden="true" />
              ) : (
                <Eye size={20} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Password Requirements */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-2">
            {t(
              "onboarding.password.requirementsTitle",
              "Password Requirements",
            )}
          </p>
          <ul className="space-y-1.5">
            {passwordRequirements.map((req, index) => (
              <li
                key={index}
                className={`flex items-center gap-2 text-sm ${
                  req.valid ? "text-green-600" : "text-gray-500"
                }`}
              >
                <Check
                  className={`h-4 w-4 ${req.valid ? "opacity-100" : "opacity-30"}`}
                />
                {req.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {t("onboarding.password.confirmLabel", "Confirm Password")}
          </label>
          <input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
            placeholder={t(
              "onboarding.password.confirmPlaceholder",
              "Confirm your password",
            )}
            required
          />
        </div>

        {error && (
          <div
            className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100"
            role="alert"
          >
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="flex-1 h-12"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("common.back", "Back")}
        </Button>
        <Button
          type="submit"
          disabled={!isPasswordValid || !confirmPassword}
          className="flex-1 bg-black hover:bg-gray-800 text-white h-12 text-base font-medium disabled:opacity-50"
        >
          {t("onboarding.password.complete", "Complete Setup")}
        </Button>
      </div>
    </form>
  );
}
