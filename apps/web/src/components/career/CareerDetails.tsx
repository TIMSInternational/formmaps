"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { useCareerDetails } from "@/hooks/useCareerQueries";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Target,
  Zap,
  DollarSign,
  GraduationCap,
  TrendingUp,
  Sparkles,
  Compass,
  Users,
} from "lucide-react";

const BRAND_BLUE = "#2E9098";
const BRAND_YELLOW = "#FFD23F";

interface CareerProfile {
  overview: string;
  whatYouDo: string[];
  keyStrengths: string[];
  educationPathways: string[];
  typicalSalaryRange: string;
  jobOutlook: string;
  relatedCareers: string[];
  dayInLife: string;
}

interface StudentMatch {
  totalScore?: number;
  confidence?: string;
  aiInsight?: string;
  needsBridging?: boolean;
  bridgingReasons?: string[];
  breakdown?: {
    discScore?: number;
    milScore?: number;
    interestsScore?: number;
    motivatorsScore?: number;
  };
}

interface CareerDetailData {
  career?: Record<string, unknown>;
  profile?: CareerProfile | null;
  studentMatch?: StudentMatch | null;
}

const looksLikeId = (s: string) => /^[A-Z]{2,5}-?\d{2,4}$/.test(s.trim());

export default function CareerDetails() {
  const { t } = useTranslation();
  const params = useParams();
  const id = Array.isArray(params?.id) ? params?.id[0] : params?.id ?? "";
  const { data: rawData, isLoading } = useCareerDetails(id);
  const router = useRouter();

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4"
            style={{ borderColor: BRAND_BLUE }}
          />
          <p className="text-gray-600 font-medium">{t("careers.details.loading")}</p>
        </div>
      </div>
    );

  const data = (rawData ?? {}) as CareerDetailData;
  const career = (data.career ?? rawData) as Record<string, unknown> | undefined;
  const profile = data.profile ?? null;
  const studentMatch = data.studentMatch ?? null;

  if (!career) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">{t("careers.details.notFoundTitle")}</h2>
        <p className="text-gray-600 mb-6">{t("careers.details.notFoundBody")}</p>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 text-white rounded-lg"
          style={{ backgroundColor: BRAND_BLUE }}
        >
          {t("careers.details.goBack")}
        </button>
      </div>
    );
  }

  const title = (career.programTitle as string) || t("careers.details.careerFallback");
  const cluster = ((career.cluster as string) || "").replace(/_/g, " ");
  const interests = (career.interest_fit as string[]) || [];
  const motivators = (career.motivator_fit as string[]) || [];
  const bridgingPaths = (career.bridging_paths as string) || "";

  const matchScore = studentMatch?.totalScore ?? null;
  const breakdown = studentMatch?.breakdown;
  const confidence = studentMatch?.confidence ?? "";
  const confLabel =
    confidence === "high"
      ? t("careers.details.matchExcellent")
      : confidence === "good"
        ? t("careers.details.matchStrong")
        : confidence === "moderate"
          ? t("careers.details.matchGood")
          : t("careers.details.match");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-gray-50 pb-12">
      {/* Hero */}
      <div className="border-b border-gray-200" style={{ backgroundColor: BRAND_BLUE }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.back()}
            className="flex items-center text-white/80 hover:text-white transition-colors mb-5 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> {t("careers.details.backToCareers")}
          </button>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold shrink-0"
                style={{ backgroundColor: BRAND_YELLOW, color: "#102B47" }}
              >
                {title.charAt(0)}
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">{title}</h1>
                <p className="text-white/70 mt-1 text-sm font-medium">{cluster}</p>
              </div>
            </div>

            {studentMatch && matchScore !== null && (
              <div className="flex items-center gap-4 px-5 py-3 rounded-2xl bg-white/10 border border-white/20">
                <div className="text-center">
                  <div className="text-3xl font-bold" style={{ color: BRAND_YELLOW }}>
                    {matchScore}%
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/80">{confLabel}</div>
                </div>
                {breakdown && (
                  <>
                    <div className="h-12 w-px bg-white/20" />
                    <div className="space-y-1.5 w-44">
                      <MatchBar label={t("careers.details.barPersonality")} value={breakdown.discScore} />
                      <MatchBar label={t("careers.details.barCognitive")} value={breakdown.milScore} />
                      <MatchBar label={t("careers.details.barInterests")} value={breakdown.interestsScore} />
                      <MatchBar label={t("careers.details.barMotivators")} value={breakdown.motivatorsScore} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personalized insight */}
            {studentMatch?.aiInsight && (
              <div
                className="rounded-xl p-6 border"
                style={{ backgroundColor: "rgba(46,144,152,0.04)", borderColor: "rgba(46,144,152,0.2)" }}
              >
                <h2 className="text-base font-bold mb-2 flex items-center gap-2" style={{ color: BRAND_BLUE }}>
                  <Sparkles className="w-5 h-5" /> {t("careers.details.whyFits")}
                </h2>
                <p className="text-gray-700 leading-relaxed text-sm">{studentMatch.aiInsight}</p>
              </div>
            )}

            {/* Overview */}
            {profile?.overview && (
              <Section icon={<BookOpen />} title={t("careers.details.aboutTitle")}>
                <p className="text-gray-600 leading-relaxed">{profile.overview}</p>
              </Section>
            )}

            {/* What You'd Do */}
            {profile?.whatYouDo && profile.whatYouDo.length > 0 && (
              <Section icon={<Target />} title={t("careers.details.whatYouDo")}>
                <ul className="space-y-3">
                  {profile.whatYouDo.map((r, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: BRAND_BLUE }} />
                      <span className="text-gray-700 text-sm">{r}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Day in the Life */}
            {profile?.dayInLife && (
              <Section icon={<Compass />} title={t("careers.details.dayInLife")}>
                <p className="text-gray-600 leading-relaxed">{profile.dayInLife}</p>
              </Section>
            )}

            {/* Key Strengths */}
            {profile?.keyStrengths && profile.keyStrengths.length > 0 && (
              <Section icon={<Zap />} title={t("careers.details.keyStrengths")}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {profile.keyStrengths.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: BRAND_BLUE }} />
                      <span className="text-sm text-gray-700">{s}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* No profile fallback — show catalog basics */}
            {!profile && (
              <Section icon={<BookOpen />} title={t("careers.details.aboutTitle")}>
                <p className="text-gray-600 leading-relaxed">
                  {t("careers.details.noProfileFallback", { title, cluster })}
                </p>
              </Section>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Salary */}
            {profile?.typicalSalaryRange && (
              <SideCard icon={<DollarSign className="w-4 h-4" />} title={t("careers.details.salaryRange")}>
                <p className="text-sm font-semibold" style={{ color: BRAND_BLUE }}>
                  {profile.typicalSalaryRange}
                </p>
              </SideCard>
            )}

            {/* Job Outlook */}
            {profile?.jobOutlook && (
              <SideCard icon={<TrendingUp className="w-4 h-4" />} title={t("careers.details.jobOutlook")}>
                <p className="text-sm text-gray-700 leading-relaxed">{profile.jobOutlook}</p>
              </SideCard>
            )}

            {/* Education Pathways */}
            {profile?.educationPathways && profile.educationPathways.length > 0 && (
              <SideCard icon={<GraduationCap className="w-4 h-4" />} title={t("careers.details.educationPathways")}>
                <div className="space-y-2">
                  {profile.educationPathways.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: BRAND_YELLOW }} />
                      {p}
                    </div>
                  ))}
                </div>
              </SideCard>
            )}

            {/* Related Careers */}
            {profile?.relatedCareers && profile.relatedCareers.length > 0 && (
              <SideCard icon={<Users className="w-4 h-4" />} title={t("careers.details.relatedCareers")}>
                <div className="flex flex-wrap gap-1.5">
                  {profile.relatedCareers.map((rc) =>
                    looksLikeId(rc) ? (
                      <a
                        key={rc}
                        href={`/careers/${rc.trim()}`}
                        className="text-xs px-2 py-1 rounded-full hover:opacity-80"
                        style={{ backgroundColor: "rgba(46,144,152,0.08)", color: BRAND_BLUE }}
                      >
                        {rc}
                      </a>
                    ) : (
                      <span
                        key={rc}
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ backgroundColor: "rgba(46,144,152,0.08)", color: BRAND_BLUE }}
                      >
                        {rc}
                      </span>
                    ),
                  )}
                </div>
              </SideCard>
            )}

            {/* Catalog profile (interests / motivators / preparation) */}
            {(interests.length > 0 || motivators.length > 0) && (
              <SideCard icon={<Sparkles className="w-4 h-4" />} title={t("careers.details.careerProfile")}>
                <div className="space-y-4">
                  {interests.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">{t("careers.details.interests")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {interests.map((i) => (
                          <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full capitalize">
                            {i.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {motivators.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">{t("careers.details.motivators")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {motivators.map((m) => (
                          <span key={m} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full capitalize">
                            {m.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </SideCard>
            )}

            {/* Preparation path from catalog bridging_paths */}
            {bridgingPaths && (
              <SideCard icon={<GraduationCap className="w-4 h-4" />} title={t("careers.details.preparationPath")}>
                <div className="space-y-2">
                  {bridgingPaths.split(";").map((path, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: BRAND_BLUE }} />
                      {path.trim()}
                    </div>
                  ))}
                </div>
              </SideCard>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MatchBar({ label, value }: { label: string; value?: number }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-white/70 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/15 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${v}%`, backgroundColor: BRAND_YELLOW }} />
      </div>
      <span className="text-[10px] text-white/80 w-7 text-right">{Math.round(v)}%</span>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactElement; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        {React.cloneElement(icon as React.ReactElement<{ className?: string; style?: React.CSSProperties }>, {
          className: "w-5 h-5",
          style: { color: BRAND_BLUE },
        })}
        {title}
      </h2>
      {children}
    </section>
  );
}

function SideCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}
