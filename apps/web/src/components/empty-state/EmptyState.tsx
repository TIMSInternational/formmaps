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
import { Illustration, type IllustrationName } from "@/components/illustration/Illustration";

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

/**
 * Each state has a drawn mark from the brand set. They replace a 20px Lucide
 * glyph in a 64px disc — five different empty states that all looked alike at a
 * glance and gave the reader nothing to recognise them by.
 *
 * A caller passing an explicit `icon` still gets the old treatment, so the
 * escape hatch that already existed keeps working.
 */
const DEFAULT_ILLUSTRATIONS: Record<EmptyStateType, IllustrationName> = {
  no_data: "no-data",
  no_results: "no-results",
  not_started: "not-started",
  loading_error: "connection-lost",
  permission_denied: "locked",
};

interface EmptyStateProps {
  type: EmptyStateType;
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Override the state's default mark, or pass null for the icon treatment. */
  illustration?: IllustrationName | null;
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
  illustration,
  actionLabel,
  actionHref,
  onAction,
  secondaryLabel,
  secondaryHref,
  onSecondary,
}: EmptyStateProps) {
  // An explicit icon, or an explicit `illustration={null}`, opts back out.
  const useIcon = icon !== undefined || illustration === null;
  const Icon = icon ?? DEFAULT_ICONS[type];
  const mark = illustration ?? DEFAULT_ILLUSTRATIONS[type];

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
        className={
          useIcon
            ? "flex items-center justify-center rounded-full mb-4"
            : "flex items-center justify-center mb-3"
        }
        style={
          useIcon
            ? {
                width: 64,
                height: 64,
                background: "var(--admin-bg-hover, var(--secondary))",
                border: "1px solid var(--admin-border-default, var(--border))",
              }
            : undefined
        }
      >
        {useIcon ? (
          <Icon
            className="h-7 w-7"
            style={{ color: "var(--admin-font-tertiary, var(--muted-foreground))" }}
          />
        ) : (
          <Illustration name={mark} size={132} />
        )}
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
