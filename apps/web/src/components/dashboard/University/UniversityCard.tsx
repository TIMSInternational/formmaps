"use client";

import React from "react";
import { motion } from "motion/react";
import {
  Star,
  MapPin,
  Heart,
  HeartOff,
  GraduationCap,
  ArrowRight,
  TrendingUp,
  Eye,
} from "lucide-react";
import { UniversityCardProps } from "@/types/university";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useGlobalStore } from "@/store/useGlobalStore";
import { Badge } from "@/components/ui/badge";

export function UniversityCard({
  university,
  matchScore,
  matchReasons,
  isFavorite,
  onFavoriteToggle,
  onViewDetails,
  onCompare,
  isCompareSelected,
  variant = "default",
}: UniversityCardProps) {
  const { language } = useGlobalStore();
  const t = (en: string, es: string) => (language === "spanish" ? es : en);
  
  const tuition =
    university.tuition.international ??
    university.tuition.outOfState ??
    university.tuition.inState ??
    0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-white transition-all duration-300",
        "hover:shadow-lg hover:border-gray-200 hover:-translate-y-1",
        variant === "featured" ? "border-blue-100 ring-1 ring-blue-50" : "border-gray-100"
      )}
      aria-labelledby={`university-${university.id}-name`}
    >
      {/* Header Image Area */}
      <div className="relative h-40 w-full overflow-hidden rounded-t-2xl bg-gray-50">
        {university.coverImage ? (
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
            style={{ backgroundImage: `url(${university.coverImage})` }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100" />
        )}
        
        {/* Featured Badge */}
        {variant === "featured" && (
          <div className="absolute top-3 left-3">
            <Badge className="bg-blue-600/90 hover:bg-blue-600 text-white border-none shadow-sm backdrop-blur-sm">
              {t("Recommended", "Recomendado")}
            </Badge>
          </div>
        )}

        {/* Match Score Badge */}
        {typeof matchScore === "number" && (
          <div 
            className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-emerald-600 shadow-sm backdrop-blur-sm"
            role="img"
            aria-label={`${matchScore}% match score`}
          >
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span aria-hidden="true">{matchScore}%</span>
          </div>
        )}

        {/* Quick View Button (Visible on Hover) */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/90 hover:bg-white text-gray-900 shadow-sm backdrop-blur-sm gap-2 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300"
            onClick={() => onViewDetails?.(university)}
            aria-label={`Quick view ${university.name}`}
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            {t("Quick View", "Vista Rápida")}
          </Button>
        </div>
      </div>

      {/* Logo & Main Info */}
      <div className="relative px-5 pt-12 pb-5 flex-1 flex flex-col">
        {/* Logo (Floating) */}
        <div className="absolute -top-8 left-5 h-16 w-16 overflow-hidden rounded-xl border-4 border-white bg-white shadow-sm">
          {university.logo ? (
             
            <img
              src={university.logo}
              alt={university.name}
              className="h-full w-full object-contain p-2"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-50 text-xs font-bold text-gray-400">
              {university.shortName || university.name.slice(0, 2)}
            </div>
          )}
        </div>

        <div className="mb-4">
          <h3 id={`university-${university.id}-name`} className="text-lg font-bold text-gray-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
            {university.name}
          </h3>
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="line-clamp-1">
              {university.city}, {university.country}
            </span>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-gray-50/80 border border-gray-100/50">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">
              {t("Rank", "Ranking")}
            </span>
            <div className="flex items-center gap-1.5 text-sm font-bold text-gray-700">
              <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" aria-hidden="true" />
              #{university.ranking.global || "-"}
            </div>
          </div>
          <div className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-gray-50/80 border border-gray-100/50">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">
              {t("Tuition", "Matrícula")}
            </span>
            <div className="flex items-center gap-1.5 text-sm font-bold text-gray-700">
              <span className="truncate">
                {tuition > 0 
                  ? `$${(tuition / 1000).toFixed(1)}k` 
                  : "-"}
              </span>
              <span className="text-[10px] font-normal text-gray-400">/yr</span>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-5 mt-auto">
          {university.type && (
            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
              {university.type}
            </span>
          )}
          {university.programs.slice(0, 2).map((p, i) => (
            <span key={i} className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
              {p.degree}
            </span>
          ))}
          {university.programs.length > 2 && (
            <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-500">
              +{university.programs.length - 2}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-between text-xs font-semibold hover:bg-blue-50 hover:text-blue-600 group/btn"
            onClick={() => onViewDetails?.(university)}
          >
            {t("View Details", "Ver Detalles")}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" aria-hidden="true" />
          </Button>
          
          <div className="flex items-center gap-1 border-l border-gray-100 pl-2">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-full transition-all duration-200",
                isFavorite 
                  ? "text-rose-500 bg-rose-50 hover:bg-rose-100" 
                  : "text-gray-400 hover:text-rose-500 hover:bg-rose-50"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onFavoriteToggle?.(university.id);
              }}
              aria-label={isFavorite ? `Remove ${university.name} from favorites` : `Add ${university.name} to favorites`}
            >
              {isFavorite ? (
                <Heart className="h-4 w-4 fill-current" aria-hidden="true" />
              ) : (
                <Heart className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export default UniversityCard;
