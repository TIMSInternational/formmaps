"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { PasswordStrengthIndicator } from "./PasswordStrengthIndicator";
import type { Control } from "react-hook-form";
import type { SignupFormData } from "./signupSchema";

interface PasswordInputProps {
  control: Control<SignupFormData>;
  name: "password" | "confirmPassword";
  label: string;
  placeholder: string;
  showStrength?: boolean;
  currentPassword?: string;
}

export function PasswordInput({
  control,
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
        <FormItem className="flex flex-col gap-1.5">
          <FormLabel htmlFor={name} className="text-xs font-medium" style={{ color: "#333" }}>
            {label}
          </FormLabel>
          <div className="relative">
            <FormControl>
              <input
                id={name}
                type={showPassword ? "text" : "password"}
                {...field}
                placeholder={placeholder}
                className="h-11 px-3 pr-10 text-sm rounded-lg border outline-none transition-colors w-full"
                style={{ background: "#F8F9FA", borderColor: "#E0E0E0", color: "#111" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#065292"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "#E0E0E0"; }}
              />
            </FormControl>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer flex items-center"
              style={{ color: "#999" }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {showStrength && currentPassword && (
            <PasswordStrengthIndicator password={currentPassword} />
          )}
          <FormMessage className="text-xs text-red-500" />
        </FormItem>
      )}
    />
  );
}
