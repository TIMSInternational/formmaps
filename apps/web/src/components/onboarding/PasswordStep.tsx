import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PasswordStepProps {
  value: string;
  onNext: (password: string) => void;
  onBack: () => void;
}

export function PasswordStep({ value, onNext, onBack }: PasswordStepProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState(value || "");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("onboarding.password.minLength", "Password must be at least 8 characters long"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("onboarding.password.noMatch", "Passwords do not match"));
      return;
    }

    onNext(password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("onboarding.password.label", "Password")}
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
              placeholder={t("onboarding.password.placeholder", "Enter your password")}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              aria-label={showPassword ? t("onboarding.password.hide", "Hide password") : t("onboarding.password.show", "Show password")}
            >
              {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {t("onboarding.password.hint", "Must be at least 8 characters long")}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("onboarding.password.confirmLabel", "Confirm Password")}
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
              placeholder={t("onboarding.password.confirmPlaceholder", "Confirm your password")}
              required
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg" role="alert">
            {error}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-6">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
        >
          {t("common.back", "Back")}
        </button>
        <button
          type="submit"
          className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 font-medium transition-colors"
        >
          {t("onboarding.password.complete", "Complete Setup")}
        </button>
      </div>
    </form>
  );
}
