"use client";

import { motion } from "motion/react";
import {
  SearchX,
  FileQuestion,
  Sparkles,
  AlertCircle,
  Lock,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

type EmptyStateType =
  | "no_data"
  | "no_results"
  | "not_started"
  | "loading_error"
  | "permission_denied";

const DEFAULT_ICONS: Record<EmptyStateType, LucideIcon> = {
  no_data: FileQuestion,
  no_results: SearchX,
  not_started: Sparkles,
  loading_error: AlertCircle,
  permission_denied: Lock,
};

interface EmptyStateProps {
  type: EmptyStateType;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  onSecondary?: () => void;
}

export function EmptyState({
  type,
  title,
  description,
  icon,
  actionLabel,
  actionHref,
  onAction,
  secondaryLabel,
  secondaryHref,
  onSecondary,
}: EmptyStateProps) {
  const Icon = icon ?? DEFAULT_ICONS[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-16 text-center rounded-xl"
      style={{
        background: "var(--admin-bg-card, var(--card))",
        border: "1px dashed var(--admin-border-default, var(--border))",
      }}
      role="status"
    >
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="flex items-center justify-center rounded-full mb-4"
        style={{
          width: 64,
          height: 64,
          background: "var(--admin-bg-hover, var(--secondary))",
          border: "1px solid var(--admin-border-default, var(--border))",
        }}
      >
        <Icon
          className="h-7 w-7"
          style={{ color: "var(--admin-font-tertiary, var(--muted-foreground))" }}
        />
      </motion.div>

      <h3
        className="text-base font-semibold mb-1.5"
        style={{ color: "var(--admin-font-primary, var(--foreground))" }}
      >
        {title}
      </h3>

      {description && (
        <p
          className="text-sm max-w-sm mb-5"
          style={{ color: "var(--admin-font-tertiary, var(--muted-foreground))" }}
        >
          {description}
        </p>
      )}

      {(actionLabel || secondaryLabel) && (
        <div className="flex gap-3">
          {actionLabel && actionHref && (
            <Link
              href={actionHref}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: "var(--admin-font-primary, var(--foreground))",
                color: "var(--admin-bg-panel, var(--background))",
              }}
            >
              {actionLabel}
            </Link>
          )}
          {actionLabel && onAction && !actionHref && (
            <button
              onClick={onAction}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: "var(--admin-font-primary, var(--foreground))",
                color: "var(--admin-bg-panel, var(--background))",
              }}
            >
              {actionLabel}
            </button>
          )}
          {secondaryLabel && secondaryHref && (
            <Link
              href={secondaryHref}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: "var(--admin-bg-hover, var(--secondary))",
                color: "var(--admin-font-primary, var(--foreground))",
                border: "1px solid var(--admin-border-default, var(--border))",
              }}
            >
              {secondaryLabel}
            </Link>
          )}
          {secondaryLabel && onSecondary && !secondaryHref && (
            <button
              onClick={onSecondary}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: "var(--admin-bg-hover, var(--secondary))",
                color: "var(--admin-font-primary, var(--foreground))",
                border: "1px solid var(--admin-border-default, var(--border))",
              }}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
