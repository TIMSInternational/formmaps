/**
 * GenerateButton Component
 *
 * Reusable button component for triggering AI content generation.
 * Handles loading states, error feedback, and modal triggering.
 */

"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Sparkles, Loader } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { DynamicContentGenerationModal } from "@/lib/dynamic-imports";

export type AIFieldType =
  | "summary"
  | "objective"
  | "bullets"
  | "project"
  | "skill"
  | "experience_description"
  | "experience_bullets"
  | "education_description"
  | "project_description"
  | "project_bullets"
  | "course_description"
  | "award_description"
  | "organization_description"
  | "publication_description"
  | "language_description"
  | "volunteer_description"
  | "reference_description"
  | "declaration_text"
  | "custom_description"
  | "custom_bullets";

export interface GenerateButtonProps {
  field: AIFieldType;
  context: Record<string, any>;
  onGenerate: (content: string | string[]) => void;
  onClose?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "icon" | "button" | "outlined";
}

export function GenerateButton({
  field,
  context,
  onGenerate,
  onClose,
  isLoading = false,
  disabled = false,
  className = "",
  showLabel = false,
  size = "sm",
  variant = "icon",
}: GenerateButtonProps) {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  const variantClasses = {
    icon: "p-1 hover:bg-accent rounded transition-colors",
    button:
      "flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors bg-primary/10 text-primary hover:bg-primary/20",
    outlined:
      "flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors border border-primary text-primary hover:bg-primary/5",
  };

  const getFieldLabel = (field: string) => {
    return t(`ai.fields.${field}.label`, {
      defaultValue: field.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    });
  };

  const getFieldTooltip = (field: string) => {
    return t(`ai.fields.${field}.tooltip`, {
      defaultValue: `Generate ${field.replace(/_/g, ' ')} using AI`
    });
  };

  const label = getFieldLabel(field);
  const tooltip = getFieldTooltip(field);

  const handleClick = () => {
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    onClose?.();
  };

  const handleGenerate = (content: string | string[]) => {
    console.debug(
      "GenerateButton: handleGenerate -> parent onGenerate",
      content
    );
    onGenerate(content);
    setIsModalOpen(false);
  };

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={handleClick}
        disabled={disabled || isLoading}
        aria-expanded={isModalOpen}
        className={cn(
          variantClasses[variant],
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        title={tooltip}
        aria-label={`${tooltip} (${label})`}
      >
        {isLoading ? (
          <>
            <Loader className={cn(sizeClasses[size], "animate-spin")} aria-hidden="true" />
            {showLabel && <span>{t("common.generating", "Generating...")}</span>}
          </>
        ) : (
          <>
            <motion.span
              initial={{ rotate: 0, scale: 1 }}
              whileHover={{ rotate: [0, -8, 8, 0], scale: 1.06 }}
              transition={{ duration: 0.6 }}
              aria-hidden="true"
            >
              <Sparkles className={sizeClasses[size]} />
            </motion.span>
            {showLabel && <span>{t("common.generate", "Generate")}</span>}
          </>
        )}
      </motion.button>

      <DynamicContentGenerationModal
        isOpen={isModalOpen}
        field={field}
        context={context}
        onClose={handleModalClose}
        onApply={handleGenerate}
      />
    </>
  );
}

