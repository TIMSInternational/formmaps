"use client";

import React from "react";
import { CareerRole } from "@/types/career";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useGlobalStore } from "@/store/useGlobalStore";
import { useTranslation } from "react-i18next";
import FavoriteButton from "./FavoriteButton";
import { usePrefetchCareers } from "@/hooks/useCareerQueries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowUpRight,
  TrendingUp,
  DollarSign,
  Globe,
  Briefcase,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { telemetry } from "@/services/telemetryService";

interface CareerCardProps {
  career: CareerRole;
  rank?: number;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onViewDetails?: (career: CareerRole) => void;
}

function CareerCardInner({ career, rank, isFavorite = false, onToggleFavorite, onViewDetails }: CareerCardProps) {
  const router = useRouter();
  const { language } = useGlobalStore();

  const title =
    career.title?.[language === "spanish" ? "es" : "en"] || career.title?.en || (typeof career.title === "string" ? career.title : "");

  const { t } = useTranslation();
  const prefetch = usePrefetchCareers();

  // Engine floor is ~25, so any 0% on screen means "not scored", never "bad
  // match" (finding 1). Treat null/≤0 as unscored: suppress the match badge and
  // show a neutral "Explore" affordance instead of a misleading red 0%.
  const rawMatchScore = career.matchScore;
  const isScored = typeof rawMatchScore === "number" && rawMatchScore > 0;
  const matchScore = isScored ? rawMatchScore : 0;
  const confidence = (career as any).confidence as string | undefined;
  const aiInsight = (career as any).aiInsight as string | undefined;

  let matchColorClass = "text-red-600 bg-red-50 border-red-100";
  let matchLabel = t("career.match.low", "Low Match");
  if (confidence === "high" || matchScore > 80) {
    matchColorClass = "text-emerald-600 bg-emerald-50 border-emerald-100";
    matchLabel = t("career.match.high", "Excellent Match");
  } else if (confidence === "good" || matchScore > 65) {
    matchColorClass = "text-blue-600 bg-blue-50 border-blue-100";
    matchLabel = t("career.match.good", "Strong Match");
  } else if (confidence === "moderate" || matchScore > 50) {
    matchColorClass = "text-amber-600 bg-amber-50 border-amber-100";
    matchLabel = t("career.match.moderate", "Good Match");
  }

  return (
    <motion.article
      className="bg-white rounded-3xl p-6 hover:shadow-xl transition-all duration-300 cursor-pointer group relative overflow-hidden border border-gray-100 h-full flex flex-col"
      layout
      onClick={() => {
        telemetry.trackCareer("view", career.id, title, "career_card");
        if (onViewDetails) {
          onViewDetails(career);
        } else {
          router.push(`/careers/${career.id}`);
        }
      }}
      onMouseEnter={() => career.id && prefetch.prefetchCareer?.(career.id)}
      aria-labelledby={`career-${career.id}-title`}
    >
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          {rank && (
            <span className="text-xs font-bold text-gray-400 bg-gray-50 rounded-lg px-2 py-1 shrink-0">
              #{rank}
            </span>
          )}
          <div>
            <h3 id={`career-${career.id}-title`} className="font-bold text-gray-900 text-lg leading-tight group-hover:text-indigo-600 transition-colors line-clamp-1">
              {title}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1 font-medium">
              <Briefcase className="h-3 w-3" aria-hidden="true" />
              {(career as any).cluster?.replace(/_/g, " ") || (career.industries || [])[0] || t("career.general", "General")}
            </div>
          </div>
        </div>

        {/* Match Score Badge — only for scored cards; unscored shows Explore */}
        {isScored ? (
          <div
            className={`flex flex-col items-center justify-center px-2.5 py-1.5 rounded-lg border ${matchColorClass}`}
            role="img"
            aria-label={`${matchScore}% match - ${matchLabel}`}
          >
            <span className="text-sm font-bold leading-none" aria-hidden="true">{matchScore}%</span>
            <span className="text-[9px] font-medium uppercase tracking-wider opacity-80 mt-0.5" aria-hidden="true">
              {matchLabel}
            </span>
          </div>
        ) : (
          <div
            className="flex items-center justify-center px-2.5 py-1.5 rounded-lg border text-gray-500 bg-gray-50 border-gray-100"
            aria-label={t("career.explore", "Explore")}
          >
            <span className="text-[9px] font-medium uppercase tracking-wider opacity-80">
              {t("career.explore", "Explore")}
            </span>
          </div>
        )}
      </div>

      {/* AI Insight */}
      {aiInsight ? (
        <div className="flex items-start gap-2 mb-4 bg-indigo-50/50 rounded-xl p-3 border border-indigo-100/50">
          <Sparkles className="h-3.5 w-3.5 text-indigo-500 mt-0.5 shrink-0" />
          <p className="text-xs text-indigo-700 leading-relaxed line-clamp-3">{aiInsight}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">
          {career.shortDescription?.[language === "spanish" ? "es" : "en"] || career.shortDescription?.en || ""}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4 flex-grow">
        {career.salaryRange?.median && (
          <Badge variant="secondary" className="bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-100 font-medium px-2.5 py-1">
            <DollarSign className="h-3 w-3 mr-1 text-gray-400" aria-hidden="true" />
            {(career.salaryRange.median / 1000).toFixed(0)}k/yr
          </Badge>
        )}
        {career.remoteEligible && (
          <Badge variant="secondary" className="bg-[#2E9098]/10 text-[#2E9098] hover:bg-[#2E9098]/20 border-[#2E9098]/20 font-medium px-2.5 py-1">
            <Globe className="h-3 w-3 mr-1 text-[#2E9098]" aria-hidden="true" />
            {t("career.remote", "Remote")}
          </Badge>
        )}
        {career.demandStats?.growthPercent && career.demandStats.growthPercent > 0.05 && (
          <Badge variant="secondary" className="bg-green-50 text-green-700 hover:bg-green-100 border-green-100 font-medium px-2.5 py-1">
            <TrendingUp className="h-3 w-3 mr-1 text-green-500" aria-hidden="true" />
            {t("career.highDemand", "High Demand")}
          </Badge>
        )}
        {career.needsBridging && (
          <Badge variant="secondary" className="bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-100 font-medium px-2.5 py-1">
            <BookOpen className="h-3 w-3 mr-1 text-purple-500" aria-hidden="true" />
            {t("career.bridgingAvailable", "Bridging Available")}
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-50 mt-auto">
        <div />
        <div className="flex items-center gap-1">
          {onToggleFavorite && (
            <div onClick={(e) => e.stopPropagation()}>
              <FavoriteButton
                isFavorite={isFavorite}
                onToggle={onToggleFavorite}
              />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-gray-300 group-hover:text-indigo-500 transition-colors rounded-full hover:bg-indigo-50"
            aria-label={t("career.viewDetails", { title })}
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </motion.article>
  );
}

const CareerCard = React.memo(CareerCardInner);
export default CareerCard;
