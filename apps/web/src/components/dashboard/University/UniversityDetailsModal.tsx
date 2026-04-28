"use client";

import React from "react";
import { motion } from "motion/react";
import { UniversityDetailsModalProps } from "@/types/university";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Globe2,
  ExternalLink,
  GraduationCap,
  TrendingUp,
  Building2,
  Users,
  Award,
  DollarSign,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";

import { useTranslation } from "react-i18next";

export function UniversityDetailsModal({
  university,
  isOpen,
  onClose,
  matchScore,
  matchBreakdown,
  matchReasons,
  recommendedPrograms,
}: UniversityDetailsModalProps) {
  const { t } = useTranslation();
  if (!university) return null;

  const tuition =
    university.tuition.international ??
    university.tuition.outOfState ??
    university.tuition.inState ??
    0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-5xl p-0 overflow-hidden gap-0 border-none shadow-2xl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{university.name}</DialogTitle>
        {/* Header Section */}
        <div className="relative h-64 w-full bg-slate-900">
          {university.coverImage ? (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-60"
              style={{ backgroundImage: `url(${university.coverImage})` }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
          
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="flex items-end justify-between gap-6">
              <div className="flex items-end gap-6">
                <div className="h-24 w-24 rounded-2xl bg-white shadow-xl flex items-center justify-center overflow-hidden border-4 border-white/10 backdrop-blur-sm">
                  {university.logo ? (
                     
                    <img
                      src={university.logo}
                      alt={university.name}
                      className="h-full w-full object-contain p-3"
                    />
                  ) : (
                    <span className="text-xl font-bold text-gray-400">
                      {university.shortName || university.name.slice(0, 2)}
                    </span>
                  )}
                </div>
                <div className="mb-2">
                  <h2 className="text-3xl font-bold text-white mb-2 drop-shadow-sm">
                    {university.name}
                  </h2>
                  <div className="flex items-center gap-4 text-slate-200">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-blue-400" aria-hidden="true" />
                      <span className="font-medium">{university.city}, {university.country}</span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-slate-500" aria-hidden="true" />
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-blue-400" aria-hidden="true" />
                      <span className="font-medium">{university.type}</span>
                    </div>
                  </div>
                </div>
              </div>

              {typeof matchScore === "number" && (
                <div className="flex flex-col items-end mb-2">
                  <div className="flex items-center gap-2 bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 px-4 py-2 rounded-xl" role="status" aria-label={`${t("university.matchScore", "Match score")}: ${matchScore}%`}>
                    <TrendingUp className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                    <span className="text-3xl font-bold text-emerald-400" aria-hidden="true">{matchScore}%</span>
                    <span className="text-xs font-medium text-emerald-200 uppercase tracking-wide ml-1" aria-hidden="true">
                      {t("university.match", "Match")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="flex flex-col lg:flex-row h-[600px]">
          {/* Main Content (Left) */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-white">
            {/* Description */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" aria-hidden="true" />
                {t("university.about", "About")}
              </h3>
              <p className="text-gray-600 leading-relaxed text-base">
                {university.description}
              </p>
            </div>

            {/* Match Analysis */}
            {matchReasons && matchReasons.length > 0 && (
              <div className="bg-emerald-50/50 rounded-2xl p-6 border border-emerald-100">
                <h3 className="text-lg font-bold text-emerald-900 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  {t("university.whyFit", "Why it's a great fit")}
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {matchReasons.map((r, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                      <span className="text-sm text-emerald-900 font-medium">{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Programs */}
            {recommendedPrograms && recommendedPrograms.length > 0 && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-blue-600" aria-hidden="true" />
                  {t("university.recommendedPrograms", "Recommended Programs")}
                </h3>
                <div className="grid gap-3">
                  {recommendedPrograms.map((p) => (
                    <div
                      key={p.id}
                      className="group flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-blue-200 hover:shadow-sm transition-all"
                    >
                      <div className="space-y-1">
                        <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                          {p.name}
                        </h4>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="font-medium px-2 py-0.5 rounded-md bg-white border border-gray-200">
                            {p.degree}
                          </span>
                          <span>{p.field}</span>
                          {p.duration && <span>• {p.duration} {t("university.years", "years")}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-emerald-600">
                          {p.matchScore.toFixed(0)}% {t("university.match", "Match")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar (Right) */}
          <div className="w-full lg:w-80 bg-gray-50 border-l border-gray-100 p-6 overflow-y-auto space-y-6">
            {/* Quick Stats */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                {t("university.keyStats", "Key Statistics")}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">{t("university.globalRank", "Global Rank")}</div>
                  <div className="text-lg font-bold text-gray-900 flex items-center gap-1">
                    <Award className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    #{university.ranking.global || "-"}
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                  <div className="text-xs text-gray-500 mb-1">{t("university.acceptance", "Acceptance")}</div>
                  <div className="text-lg font-bold text-gray-900 flex items-center gap-1">
                    <Users className="h-4 w-4 text-blue-500" aria-hidden="true" />
                    {university.acceptanceRate}%
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-green-600" aria-hidden="true" />
                  <span className="text-sm font-bold text-gray-900">{t("university.tuition", "Tuition")}</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  ${(tuition).toLocaleString()}
                  <span className="text-sm font-normal text-gray-500 ml-1">
                    {university.tuition.currency}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {t("university.estimatedPerYear", "Estimated per year")}
                </p>
              </div>
            </div>

            {/* Highlights */}
            {university.highlights && university.highlights.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {t("university.highlights", "Highlights")}
                </h4>
                <ul className="space-y-2">
                  {university.highlights.map((h, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Links */}
            <div className="space-y-3 pt-4 border-t border-gray-200">
              <Button className="w-full justify-between" asChild>
                <a href={university.website} target="_blank" rel="noreferrer">
                  {t("university.visitWebsite", "Visit Website")}
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
              {university.admissionsUrl && (
                <Button variant="outline" className="w-full justify-between" asChild>
                  <a href={university.admissionsUrl} target="_blank" rel="noreferrer">
                    {t("university.admissions", "Admissions")}
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UniversityDetailsModal;
