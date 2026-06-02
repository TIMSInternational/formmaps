"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";
import type { Control, FieldErrors } from "react-hook-form";
import type { SignupFormData } from "./signupSchema";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
    </svg>
  );
}

interface PasswordInputProps {
  control: Control<SignupFormData>;
  errors: FieldErrors<SignupFormData>;
  name: "password" | "confirmPassword";
  label: string;
  placeholder: string;
  showStrength?: boolean;
  currentPassword?: string;
}

export function PasswordInput({
  control,
  errors,
  name,
  label,
  placeholder,
  showStrength = false,
  currentPassword,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="space-y-2">
          <FormLabel htmlFor={name} className="text-sm font-medium text-gray-700">
            {label}
          </FormLabel>
          <div className="relative">
            <FormControl>
              <Input
                id={name}
                type={showPassword ? "text" : "password"}
                {...field}
                placeholder={placeholder}
                className={cn(
                  "h-11 text-base bg-white/50 backdrop-blur-sm border-gray-200/50 focus:border-purple-500 focus:ring-purple-500/20 pr-12",
                  errors[name] &&
                    "border-red-300 focus:border-red-500 focus:ring-red-500/20"
                )}
              />
            </FormControl>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
          {showStrength && currentPassword && (
            <PasswordStrengthIndicator password={currentPassword} />
          )}
          <FormMessage className="text-xs text-red-600" />
        </FormItem>
      )}
    />
  );
}
