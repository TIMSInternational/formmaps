"use client";

import React from "react";
import { UniversityDetailsModalProps } from "@/types/university";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MapPin,
  ExternalLink,
  GraduationCap,
  TrendingUp,
  Building2,
  Users,
  Award,
  DollarSign,
  CheckCircle2,
  Sparkles,
  Globe,
  BookOpen,
  ArrowUpRight,
  Star,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";

export function UniversityDetailsModal({
  university,
  isOpen,
  onClose,
  matchScore,
  matchBreakdown,
  matchReasons,
  recommendedPrograms,
}: UniversityDetailsModalProps) {
  const { language } = useGlobalStore();
  const t = (en: string, es: string) => (language === "spanish" ? es : en);

  if (!university) return null;

  const tuition =
    university.tuition?.international ??
    university.tuition?.outOfState ??
    university.tuition?.inState ??
    0;

  const globalRank = university.ranking?.global;
  const nationalRank = university.ranking?.national;
  const acceptRate = university.acceptanceRate;
  const setting = university.setting;
  const campusSize = university.campusSize;

  const confColor =
    matchScore && matchScore >= 85 ? "text-emerald-400" :
    matchScore && matchScore >= 70 ? "text-blue-400" : "text-amber-400";
  const confBg =
    matchScore && matchScore >= 85 ? "bg-emerald-500/10 border-emerald-500/20" :
    matchScore && matchScore >= 70 ? "bg-blue-500/10 border-blue-500/20" : "bg-amber-500/10 border-amber-500/20";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl w-[95vw] sm:w-full p-0 overflow-hidden gap-0 border-[var(--admin-border-default)] bg-[var(--admin-bg-panel)] shadow-2xl rounded-2xl max-h-[90vh]"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{university.name}</DialogTitle>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[var(--admin-border-light)]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="h-14 w-14 rounded-xl bg-[var(--admin-bg-icon-box)] flex items-center justify-center text-[var(--admin-font-secondary)] text-lg font-bold shrink-0 border border-[var(--admin-border-light)]">
                {university.shortName?.slice(0, 3) || university.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-[var(--admin-font-primary)] leading-tight">
                  {university.name}
                </h2>
                <div className="flex items-center gap-3 mt-1.5 text-sm text-[var(--admin-font-tertiary)]">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {university.city}, {university.country}
                  </span>
                  <span className="text-[var(--admin-border-default)]">·</span>
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="capitalize">{university.type}</span>
                  </span>
                  {setting && (
                    <>
                      <span className="text-[var(--admin-border-default)]">·</span>
                      <span className="capitalize">{setting}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {typeof matchScore === "number" && (
              <div className={cn("flex items-center gap-2 px-4 py-2 rounded-xl border shrink-0", confBg)}>
                <TrendingUp className={cn("h-4 w-4", confColor)} />
                <span className={cn("text-2xl font-bold", confColor)}>{matchScore.toFixed(0)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="max-h-[65vh] overflow-y-auto">
          {/* Match breakdown */}
          {matchBreakdown && (
            <div className="px-6 py-4 border-b border-[var(--admin-border-light)]">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: t("Cognitive", "Cognitivo"), value: matchBreakdown.academicMatch, icon: BarChart3 },
                  { label: t("Career", "Carrera"), value: matchBreakdown.careerAlignment, icon: TrendingUp },
                  { label: t("Personality", "Personalidad"), value: matchBreakdown.personalityMatch, icon: Star },
                  { label: t("Preferences", "Preferencias"), value: matchBreakdown.preferencesMatch, icon: CheckCircle2 },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <item.icon className="h-3 w-3 text-[var(--admin-font-tertiary)]" />
                      <span className="text-[10px] text-[var(--admin-font-tertiary)] uppercase tracking-wider font-medium">{item.label}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--admin-bg-hover)] overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", (item.value ?? 0) >= 80 ? "bg-emerald-500" : (item.value ?? 0) >= 60 ? "bg-blue-500" : "bg-amber-500")}
                        style={{ width: `${Math.min(item.value ?? 0, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-[var(--admin-font-secondary)] mt-1 inline-block">{(item.value ?? 0).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI insights */}
          {matchReasons && matchReasons.length > 0 && (
            <div className="px-6 py-4 border-b border-[var(--admin-border-light)]">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-[var(--admin-accent-blue)]" />
                <span className="text-xs font-bold text-[var(--admin-font-secondary)] uppercase tracking-wider">{t("Why it's a great fit", "Por qué es ideal")}</span>
              </div>
              <div className="space-y-2">
                {matchReasons.map((r, idx) => (
                  <div key={idx} className="flex items-start gap-2.5">
                    <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--admin-accent-blue)] shrink-0" />
                    <span className="text-sm text-[var(--admin-font-secondary)] leading-relaxed">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="px-6 py-4 border-b border-[var(--admin-border-light)]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <StatBox icon={Award} label={t("Rank", "Ranking")} value={globalRank ? `#${globalRank}` : "—"} accent="text-amber-400" />
              <StatBox icon={Users} label={t("Accept", "Acepta")} value={acceptRate ? `${acceptRate}%` : "—"} accent="text-blue-400" />
              <StatBox icon={DollarSign} label={t("Tuition", "Matrícula")} value={tuition > 0 ? `$${(tuition / 1000).toFixed(0)}k` : "—"} accent="text-emerald-400" />
              <StatBox icon={GraduationCap} label={t("Programs", "Programas")} value={String(recommendedPrograms?.length || university.programCount || "—")} accent="text-purple-400" />
            </div>
          </div>

          {/* Description */}
          {university.description && (
            <div className="px-6 py-4 border-b border-[var(--admin-border-light)]">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-4 w-4 text-[var(--admin-font-tertiary)]" />
                <span className="text-xs font-bold text-[var(--admin-font-secondary)] uppercase tracking-wider">{t("About", "Acerca de")}</span>
              </div>
              <p className="text-sm text-[var(--admin-font-tertiary)] leading-relaxed">{university.description}</p>
            </div>
          )}

          {/* Highlights */}
          {university.highlights && university.highlights.length > 0 && (
            <div className="px-6 py-4 border-b border-[var(--admin-border-light)]">
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-4 w-4 text-[var(--admin-font-tertiary)]" />
                <span className="text-xs font-bold text-[var(--admin-font-secondary)] uppercase tracking-wider">{t("Highlights", "Destacados")}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {university.highlights.map((h, idx) => (
                  <span key={idx} className="text-xs px-2.5 py-1 rounded-lg bg-[var(--admin-bg-hover)] text-[var(--admin-font-secondary)] border border-[var(--admin-border-light)]">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Programs */}
          {recommendedPrograms && recommendedPrograms.length > 0 && (
            <div className="px-6 py-4 border-b border-[var(--admin-border-light)]">
              <div className="flex items-center gap-2 mb-3">
                <GraduationCap className="h-4 w-4 text-[var(--admin-font-tertiary)]" />
                <span className="text-xs font-bold text-[var(--admin-font-secondary)] uppercase tracking-wider">{t("Programs", "Programas")}</span>
              </div>
              <div className="grid gap-2">
                {recommendedPrograms.map((p, idx) => (
                  <div
                    key={p.id || `prog-${idx}`}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[var(--admin-bg-hover)] border border-[var(--admin-border-light)] hover:border-[var(--admin-border-hover)] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-7 w-7 rounded-md bg-[var(--admin-bg-icon-box)] flex items-center justify-center shrink-0">
                        <GraduationCap className="h-3.5 w-3.5 text-[var(--admin-font-tertiary)]" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-[var(--admin-font-primary)] line-clamp-1">{p.name}</span>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--admin-font-tertiary)]">
                          <span>{p.degree}</span>
                          {p.field && <><span>·</span><span>{p.field}</span></>}
                          {p.duration && <><span>·</span><span>{p.duration}yr</span></>}
                        </div>
                      </div>
                    </div>
                    {p.academicRigor && (
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded font-medium capitalize shrink-0",
                        p.academicRigor === "high" ? "bg-red-500/10 text-red-400" :
                        p.academicRigor === "competitive" ? "bg-amber-500/10 text-amber-400" :
                        "bg-emerald-500/10 text-emerald-400"
                      )}>
                        {p.academicRigor}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center gap-3 border-t border-[var(--admin-border-light)]">
          {university.website && (
            <a
              href={university.website.startsWith("http") ? university.website : `https://${university.website}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--admin-accent-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Globe className="h-4 w-4" />
              {t("Visit Website", "Visitar Sitio")}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          )}
          {university.admissionsUrl && (
            <a
              href={university.admissionsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--admin-border-default)] text-[var(--admin-font-secondary)] text-sm font-medium hover:bg-[var(--admin-bg-hover)] transition-colors"
            >
              {t("Admissions", "Admisiones")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatBox({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col items-center p-3 rounded-xl bg-[var(--admin-bg-hover)] border border-[var(--admin-border-light)]">
      <Icon className={cn("h-4 w-4 mb-1", accent)} />
      <span className="text-sm font-bold text-[var(--admin-font-primary)]">{value}</span>
      <span className="text-[10px] text-[var(--admin-font-tertiary)] mt-0.5">{label}</span>
    </div>
  );
}

export default UniversityDetailsModal;
