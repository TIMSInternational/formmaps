"use client";

import React from "react";
import {
  MapPin,
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
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import { UniversityGoalButton } from "./UniversityGoalButton";
import { formatAcceptanceRate } from "@/components/dashboard/University/universityFormat";
import type {
  University,
  MatchBreakdown,
  UniversityProgram,
} from "@/types/university";

interface UniversityDetailPanelProps {
  university: University;
  matchScore?: number;
  matchBreakdown?: MatchBreakdown;
  matchReasons?: string[];
  recommendedPrograms?: (UniversityProgram & { matchScore: number })[];
}

export function UniversityDetailPanel({
  university,
  matchScore,
  matchBreakdown,
  matchReasons,
  recommendedPrograms,
}: UniversityDetailPanelProps) {
  const { language } = useGlobalStore();
  const t = (en: string, es: string) => (language === "spanish" ? es : en);

  const tuition =
    university.tuition?.international ??
    university.tuition?.outOfState ??
    university.tuition?.inState ??
    0;

  const globalRank = university.ranking?.global;
  const acceptRate = university.acceptanceRate;
  const setting = university.setting;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="h-12 w-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            background: "var(--admin-bg-icon-box)",
            color: "var(--admin-font-secondary)",
            border: "1px solid var(--admin-border-light)",
          }}
        >
          {university.shortName?.slice(0, 3) || university.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <h3
            className="text-base font-bold leading-tight"
            style={{ color: "var(--admin-font-primary)" }}
          >
            {university.name}
          </h3>
          <div
            className="flex items-center gap-2 mt-1 text-xs"
            style={{ color: "var(--admin-font-tertiary)" }}
          >
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {university.city}, {university.country}
            </span>
            <span style={{ color: "var(--admin-border-default)" }}>·</span>
            <span className="flex items-center gap-1 capitalize">
              <Building2 className="h-3 w-3" />
              {university.type}
            </span>
            {setting && (
              <>
                <span style={{ color: "var(--admin-border-default)" }}>·</span>
                <span className="capitalize">{setting}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Match Score */}
      {typeof matchScore === "number" && (
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl border",
            matchScore >= 85
              ? "bg-emerald-500/10 border-emerald-500/20"
              : matchScore >= 70
              ? "bg-blue-500/10 border-blue-500/20"
              : "bg-amber-500/10 border-amber-500/20",
          )}
        >
          <TrendingUp
            className={cn(
              "h-5 w-5",
              matchScore >= 85
                ? "text-emerald-400"
                : matchScore >= 70
                ? "text-blue-400"
                : "text-amber-400",
            )}
          />
          <div>
            <span
              className={cn(
                "text-2xl font-bold",
                matchScore >= 85
                  ? "text-emerald-400"
                  : matchScore >= 70
                  ? "text-blue-400"
                  : "text-amber-400",
              )}
            >
              {matchScore.toFixed(0)}%
            </span>
            <span
              className="text-xs ml-2"
              style={{ color: "var(--admin-font-tertiary)" }}
            >
              {t("Match Score", "Puntuacion")}
            </span>
          </div>
        </div>
      )}

      {/* Match Breakdown */}
      {matchBreakdown && (
        <div className="space-y-2">
          <SectionLabel icon={BarChart3} label={t("Match Breakdown", "Desglose")} />
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: t("Cognitive", "Cognitivo"), value: matchBreakdown.academicMatch },
              { label: t("Career", "Carrera"), value: matchBreakdown.careerAlignment },
              { label: t("Personality", "Personalidad"), value: matchBreakdown.personalityMatch },
              { label: t("Preferences", "Preferencias"), value: matchBreakdown.preferencesMatch },
            ].map((item) => (
              <div
                key={item.label}
                className="p-2.5 rounded-lg"
                style={{
                  background: "var(--admin-bg-hover)",
                  border: "1px solid var(--admin-border-light)",
                }}
              >
                <div
                  className="text-[10px] uppercase tracking-wider font-medium mb-1"
                  style={{ color: "var(--admin-font-tertiary)" }}
                >
                  {item.label}
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 h-1.5 rounded-full overflow-hidden"
                    style={{ background: "var(--admin-bg-active)" }}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full",
                        (item.value ?? 0) >= 80 ? "bg-emerald-500" : (item.value ?? 0) >= 60 ? "bg-blue-500" : "bg-amber-500",
                      )}
                      style={{ width: `${Math.min(item.value ?? 0, 100)}%` }}
                    />
                  </div>
                  <span
                    className="text-xs font-bold"
                    style={{ color: "var(--admin-font-secondary)" }}
                  >
                    {(item.value ?? 0).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Insights */}
      {matchReasons && matchReasons.length > 0 && (
        <div className="space-y-2">
          <SectionLabel icon={Sparkles} label={t("Why it's a great fit", "Por que es ideal")} accent />
          <div className="space-y-1.5">
            {matchReasons.map((r, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div
                  className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: "var(--admin-accent-blue)" }}
                />
                <span
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--admin-font-secondary)" }}
                >
                  {r}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="space-y-2">
        <SectionLabel icon={Award} label={t("Key Facts", "Datos Clave")} />
        <div className="grid grid-cols-2 gap-2">
          <StatBox icon={Award} label={t("Rank", "Ranking")} value={globalRank ? `#${globalRank}` : "--"} accent="text-amber-400" />
          <StatBox icon={Users} label={t("Accept", "Acepta")} value={formatAcceptanceRate(acceptRate)} accent="text-blue-400" />
          <StatBox icon={DollarSign} label={t("Tuition", "Matricula")} value={tuition > 0 ? `$${(tuition / 1000).toFixed(0)}k` : "--"} accent="text-emerald-400" />
          <StatBox icon={GraduationCap} label={t("Programs", "Programas")} value={String(recommendedPrograms?.length || university.programs?.length || "--")} accent="text-purple-400" />
        </div>
      </div>

      {/* Description */}
      {university.description && (
        <div className="space-y-2">
          <SectionLabel icon={BookOpen} label={t("About", "Acerca de")} />
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--admin-font-tertiary)" }}
          >
            {university.description}
          </p>
        </div>
      )}

      {/* Highlights */}
      {university.highlights && university.highlights.length > 0 && (
        <div className="space-y-2">
          <SectionLabel icon={Star} label={t("Highlights", "Destacados")} />
          <div className="flex flex-wrap gap-1.5">
            {university.highlights.map((h, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-1 rounded-md"
                style={{
                  background: "var(--admin-bg-hover)",
                  color: "var(--admin-font-secondary)",
                  border: "1px solid var(--admin-border-light)",
                }}
              >
                {h}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Programs */}
      {recommendedPrograms && recommendedPrograms.length > 0 && (
        <div className="space-y-2">
          <SectionLabel icon={GraduationCap} label={t("Recommended Programs", "Programas Recomendados")} />
          <div className="space-y-1.5">
            {recommendedPrograms.map((p, idx) => (
              <div
                key={p.id || `prog-${idx}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg transition-colors"
                style={{
                  background: "var(--admin-bg-hover)",
                  border: "1px solid var(--admin-border-light)",
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="h-6 w-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: "var(--admin-bg-icon-box)" }}
                  >
                    <GraduationCap className="h-3 w-3" style={{ color: "var(--admin-font-tertiary)" }} />
                  </div>
                  <div className="min-w-0">
                    <span
                      className="text-xs font-medium line-clamp-1"
                      style={{ color: "var(--admin-font-primary)" }}
                    >
                      {p.name}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--admin-font-tertiary)" }}>
                      <span>{p.degree}</span>
                      {p.field && <><span>·</span><span>{p.field}</span></>}
                    </div>
                  </div>
                </div>
                {p.academicRigorLevel && (
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                      p.academicRigorLevel >= 8 ? "bg-red-500/10 text-red-400" :
                      p.academicRigorLevel >= 5 ? "bg-amber-500/10 text-amber-400" :
                      "bg-emerald-500/10 text-emerald-400",
                    )}
                  >
                    {p.academicRigorLevel >= 8 ? "High" : p.academicRigorLevel >= 5 ? "Medium" : "Standard"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Graduation goal entry point */}
      <UniversityGoalButton
        universityId={university.id}
        universityName={university.name}
        suggestedMajors={(recommendedPrograms ?? []).map((p) => p.name)}
      />

      {/* Links */}
      <div className="flex gap-2 pt-2">
        {university.website && (
          <a
            href={university.website.startsWith("http") ? university.website : `https://${university.website}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-white text-sm font-medium hover:opacity-90 transition-opacity"
            style={{ background: "var(--admin-accent-blue)" }}
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
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              border: "1px solid var(--admin-border-default)",
              color: "var(--admin-font-secondary)",
            }}
          >
            {t("Admissions", "Admisiones")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ icon: Icon, label, accent }: { icon: React.ElementType; label: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" style={{ color: accent ? "var(--admin-accent-blue)" : "var(--admin-font-tertiary)" }} />
      <span
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: "var(--admin-font-tertiary)" }}
      >
        {label}
      </span>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent: string }) {
  return (
    <div
      className="flex flex-col items-center p-2.5 rounded-lg"
      style={{
        background: "var(--admin-bg-hover)",
        border: "1px solid var(--admin-border-light)",
      }}
    >
      <Icon className={cn("h-3.5 w-3.5 mb-1", accent)} />
      <span className="text-sm font-bold" style={{ color: "var(--admin-font-primary)" }}>{value}</span>
      <span className="text-[10px] mt-0.5" style={{ color: "var(--admin-font-tertiary)" }}>{label}</span>
    </div>
  );
}
