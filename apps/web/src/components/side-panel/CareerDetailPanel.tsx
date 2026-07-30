"use client";

import {
  Briefcase,
  DollarSign,
  TrendingUp,
  Globe,
  BookOpen,
  Sparkles,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/useGlobalStore";
import Link from "next/link";
import type { CareerRole } from "@/types/career";

interface CareerDetailPanelProps {
  career: CareerRole;
  matchScore?: number;
  confidence?: string;
  aiInsight?: string;
  bridgingReasons?: string[];
}

export function CareerDetailPanel({
  career,
  matchScore,
  confidence,
  aiInsight,
  bridgingReasons,
}: CareerDetailPanelProps) {
  const { language } = useGlobalStore();
  const title = career.title[language === "spanish" ? "es" : "en"] || career.title.en || "";
  const description = career.shortDescription?.[language === "spanish" ? "es" : "en"] || career.shortDescription?.en || "";

  const scoreColor =
    (matchScore ?? 0) > 80 ? "text-emerald-400" :
    (matchScore ?? 0) > 65 ? "text-blue-400" :
    (matchScore ?? 0) > 50 ? "text-amber-400" : "text-red-400";

  const scoreBg =
    (matchScore ?? 0) > 80 ? "bg-emerald-500/10 border-emerald-500/20" :
    (matchScore ?? 0) > 65 ? "bg-blue-500/10 border-blue-500/20" :
    (matchScore ?? 0) > 50 ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-base font-bold leading-tight" style={{ color: "var(--admin-font-primary)" }}>
          {title}
        </h3>
        <div className="flex items-center gap-2 mt-1.5 text-xs" style={{ color: "var(--admin-font-tertiary)" }}>
          <Briefcase className="h-3 w-3" />
          <span>{(career as any).cluster?.replace(/_/g, " ") || (career.industries || [])[0] || "General"}</span>
        </div>
      </div>

      {/* Match Score — only when actually scored. Engine floor is ~25%, so a
          null/<=0 value means "not scored", never a genuine 0% match. */}
      {typeof matchScore === "number" && matchScore > 0 && (
        <div className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border", scoreBg)}>
          <TrendingUp className={cn("h-5 w-5", scoreColor)} />
          <div>
            <span className={cn("text-2xl font-bold", scoreColor)}>{matchScore}%</span>
            <span className="text-xs ml-2" style={{ color: "var(--admin-font-tertiary)" }}>
              {confidence === "high" ? "Excellent Match" : confidence === "good" ? "Strong Match" : "Match Score"}
            </span>
          </div>
        </div>
      )}

      {/* AI Insight */}
      {aiInsight && (
        <div className="space-y-2">
          <SectionLabel icon={Sparkles} label="AI Insight" accent />
          <p className="text-sm leading-relaxed" style={{ color: "var(--admin-font-secondary)" }}>
            {aiInsight}
          </p>
        </div>
      )}

      {/* Description */}
      {description && (
        <div className="space-y-2">
          <SectionLabel icon={BookOpen} label="About this Career" />
          <p className="text-sm leading-relaxed" style={{ color: "var(--admin-font-tertiary)" }}>
            {description}
          </p>
        </div>
      )}

      {/* Key Stats */}
      <div className="space-y-2">
        <SectionLabel icon={TrendingUp} label="Key Facts" />
        <div className="grid grid-cols-2 gap-2">
          {career.salaryRange?.median && (
            <StatBox
              icon={DollarSign}
              label="Median Salary"
              value={`$${(career.salaryRange.median / 1000).toFixed(0)}k/yr`}
              accent="text-emerald-400"
            />
          )}
          {career.demandStats?.growthPercent != null && (
            <StatBox
              icon={TrendingUp}
              label="Growth"
              value={`${(career.demandStats.growthPercent * 100).toFixed(0)}%`}
              accent="text-blue-400"
            />
          )}
          {career.remoteEligible && (
            <StatBox icon={Globe} label="Remote" value="Eligible" accent="text-purple-400" />
          )}
          {career.industries && career.industries.length > 0 && (
            <StatBox icon={Briefcase} label="Industries" value={String(career.industries.length)} accent="text-amber-400" />
          )}
        </div>
      </div>

      {/* Bridging Gaps */}
      {bridgingReasons && bridgingReasons.length > 0 && (
        <div className="space-y-2">
          <SectionLabel icon={AlertTriangle} label="Skills to Bridge" />
          <div className="space-y-1.5">
            {bridgingReasons.map((r, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 px-3 py-2 rounded-lg"
                style={{
                  background: "var(--admin-accent-bg-amber, rgba(245,158,11,0.1))",
                  border: "1px solid var(--admin-accent-border-amber, rgba(245,158,11,0.15))",
                }}
              >
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-400" />
                <span className="text-xs" style={{ color: "var(--admin-font-secondary)" }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {career.skills && career.skills.length > 0 && (
        <div className="space-y-2">
          <SectionLabel icon={BookOpen} label="Key Skills" />
          <div className="flex flex-wrap gap-1.5">
            {career.skills.slice(0, 10).map((s: any, idx: number) => (
              <span
                key={idx}
                className="text-xs px-2 py-1 rounded-md"
                style={{
                  background: "var(--admin-bg-hover)",
                  color: "var(--admin-font-secondary)",
                  border: "1px solid var(--admin-border-light)",
                }}
              >
                {typeof s === "string" ? s : s.name || s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Full details link */}
      <Link
        href={`/careers/${career.id}`}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
        style={{ background: "var(--admin-accent-blue)", color: "#fff" }}
      >
        View Full Details
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function SectionLabel({ icon: Icon, label, accent }: { icon: React.ElementType; label: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" style={{ color: accent ? "var(--admin-accent-blue)" : "var(--admin-font-tertiary)" }} />
      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--admin-font-tertiary)" }}>{label}</span>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col items-center p-2.5 rounded-lg" style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-light)" }}>
      <Icon className={cn("h-3.5 w-3.5 mb-1", accent)} />
      <span className="text-sm font-bold" style={{ color: "var(--admin-font-primary)" }}>{value}</span>
      <span className="text-[10px] mt-0.5" style={{ color: "var(--admin-font-tertiary)" }}>{label}</span>
    </div>
  );
}
