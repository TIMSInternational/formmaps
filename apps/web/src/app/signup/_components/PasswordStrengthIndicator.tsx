"use client";

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface PasswordValidation {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
}

interface PasswordStrength {
  strength: number;
  /** i18n key (common namespace); empty when there is no password */
  label: string;
  color: string;
}

function validatePassword(password: string): PasswordValidation {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { strength: 0, label: "", color: "" };

  const validation = validatePassword(password);
  const { length, uppercase, lowercase, number, special } = validation;

  const levels = [
    { strength: 0, label: "", color: "" },
    { strength: 1, label: "auth.password.strength.veryWeak", color: "bg-red-500" },
    { strength: 2, label: "auth.password.strength.weak", color: "bg-orange-500" },
    { strength: 3, label: "auth.password.strength.fair", color: "bg-yellow-500" },
    { strength: 4, label: "auth.password.strength.good", color: "bg-blue-500" },
    { strength: 5, label: "auth.password.strength.strong", color: "bg-green-500" },
  ];

  let score = 0;
  if (!length) {
    score = 0;
  } else if (!(uppercase && lowercase && number)) {
    score = 1 + (special ? 1 : 0);
  } else {
    score = 4 + (special ? 1 : 0);
  }

  const index = Math.min(score, levels.length - 1);
  return levels[index];
}

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const { t } = useTranslation();
  const passwordStrength = getPasswordStrength(password);

  if (!password) return null;

  return (
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
          {t("auth.password.strengthLabel")}{" "}
          <span className="font-medium">
            {t(passwordStrength.label)}
          </span>
        </p>
      )}
    </div>
  );
}
