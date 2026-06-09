"use client";

import React from "react";
import { motion } from "motion/react";
import {
  Star,
  MapPin,
  Heart,
  GraduationCap,
  ArrowUpRight,
  DollarSign,
  Users,
  Sparkles,
  GitCompareArrows,
} from "lucide-react";
import { UniversityCardProps } from "@/types/university";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useCompare } from "@/components/compare/CompareContext";
import { formatAcceptanceRate } from "./universityFormat";

function UniversityCardInner({
  university,
  matchScore,
  matchReasons,
  isFavorite,
  onFavoriteToggle,
  onViewDetails,
  variant = "default",
}: UniversityCardProps) {
  const { language } = useGlobalStore();
  const { isComparing, addToCompare, removeFromCompare, isFull } = useCompare();
  const t = (en: string, es: string) => (language === "spanish" ? es : en);
  const compared = isComparing(university.id);

  const tuition =
    university.tuition?.international ??
    university.tuition?.outOfState ??
    university.tuition?.inState ??
    0;

  const globalRank = university.ranking?.global;
  const acceptRate = university.acceptanceRate;
  const programCount = university.programCount ?? (university as any).programs?.length ?? 0;
  const setting = university.setting;

  const confColor =
    matchScore && matchScore >= 85
      ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/20"
      : matchScore && matchScore >= 70
      ? "text-blue-400 bg-blue-500/15 border-blue-500/20"
      : "text-amber-400 bg-amber-500/15 border-amber-500/20";

  const confLabel =
    matchScore && matchScore >= 85
      ? t("Excellent", "Excelente")
      : matchScore && matchScore >= 70
      ? t("Strong", "Fuerte")
      : t("Good", "Buena");

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group relative flex flex-col rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden",
        "bg-[var(--admin-bg-card)] border-[var(--admin-border-default)]",
        "hover:border-[var(--admin-border-hover)] hover:bg-[var(--admin-bg-card-hover)]"
      )}
      onClick={() => onViewDetails?.(university)}
      aria-labelledby={`uni-${university.id}-name`}
    >
      {/* Top section: match score + rank */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        {typeof matchScore === "number" ? (
          <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold", confColor)}>
            <Sparkles className="h-3 w-3" />
            {matchScore.toFixed(0)}% {confLabel}
          </div>
        ) : (
          <div />
        )}
        {globalRank && (
          <div className="flex items-center gap-1 text-xs text-[var(--admin-font-tertiary)]">
            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
            <span className="font-semibold text-[var(--admin-font-secondary)]">#{globalRank}</span>
          </div>
        )}
      </div>

      {/* University name + location */}
      <div className="px-5 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-[var(--admin-bg-icon-box)] flex items-center justify-center text-[var(--admin-font-secondary)] text-sm font-bold shrink-0">
            {university.shortName?.slice(0, 2) || university.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h3
              id={`uni-${university.id}-name`}
              className="text-sm font-bold text-[var(--admin-font-primary)] line-clamp-1 group-hover:text-[var(--admin-accent-blue)] transition-colors"
            >
              {university.name}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-[var(--admin-font-tertiary)] mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{university.city}, {university.country}</span>
              {setting && (
                <>
                  <span className="text-[var(--admin-border-default)]">·</span>
                  <span className="capitalize">{setting}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Insight */}
      {matchReasons && matchReasons.length > 0 && (
        <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-[var(--admin-bg-hover)] border border-[var(--admin-border-light)]">
          <p className="text-[11px] text-[var(--admin-font-tertiary)] leading-relaxed line-clamp-2">
            {matchReasons[0]}
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-px mx-5 mb-4 rounded-lg overflow-hidden border border-[var(--admin-border-light)]">
        <div className="flex flex-col items-center py-2.5 bg-[var(--admin-bg-hover)]">
          <DollarSign className="h-3 w-3 text-[var(--admin-font-tertiary)] mb-1" />
          <span className="text-xs font-bold text-[var(--admin-font-primary)]">
            {tuition > 0 ? `$${(tuition / 1000).toFixed(0)}k` : "—"}
          </span>
          <span className="text-[9px] text-[var(--admin-font-tertiary)]">/yr</span>
        </div>
        <div className="flex flex-col items-center py-2.5 bg-[var(--admin-bg-hover)]">
          <Users className="h-3 w-3 text-[var(--admin-font-tertiary)] mb-1" />
          <span className="text-xs font-bold text-[var(--admin-font-primary)]">
            {formatAcceptanceRate(acceptRate)}
          </span>
          <span className="text-[9px] text-[var(--admin-font-tertiary)]">{t("Accept", "Acepta")}</span>
        </div>
        <div className="flex flex-col items-center py-2.5 bg-[var(--admin-bg-hover)]">
          <GraduationCap className="h-3 w-3 text-[var(--admin-font-tertiary)] mb-1" />
          <span className="text-xs font-bold text-[var(--admin-font-primary)]">
            {programCount || "—"}
          </span>
          <span className="text-[9px] text-[var(--admin-font-tertiary)]">{t("Programs", "Programas")}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--admin-border-light)]">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--admin-font-tertiary)]">
          <span className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-medium capitalize",
            university.type === "private"
              ? "bg-purple-500/10 text-purple-400"
              : "bg-blue-500/10 text-blue-400"
          )}>
            {university.type}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (compared) removeFromCompare(university.id);
              else addToCompare(university.id);
            }}
            disabled={!compared && isFull}
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center transition-colors",
              compared
                ? "text-blue-400 bg-blue-500/10 hover:bg-blue-500/20"
                : "text-[var(--admin-font-tertiary)] hover:text-blue-400 hover:bg-blue-500/10 disabled:opacity-30"
            )}
            aria-label={compared ? "Remove from compare" : "Add to compare"}
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onFavoriteToggle?.(university.id); }}
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center transition-colors",
              isFavorite
                ? "text-rose-400 bg-rose-500/10 hover:bg-rose-500/20"
                : "text-[var(--admin-font-tertiary)] hover:text-rose-400 hover:bg-rose-500/10"
            )}
            aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
          >
            <Heart className={cn("h-3.5 w-3.5", isFavorite && "fill-current")} />
          </button>
          <div className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--admin-font-tertiary)] group-hover:text-[var(--admin-accent-blue)] transition-colors">
            <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export const UniversityCard = React.memo(UniversityCardInner);
export default UniversityCard;
