"use client";

import React from "react";
import { useCareerDetails } from "@/hooks/useCareerQueries";
import { useTimsCareerScoring } from "@/hooks/useTimsQueries";
import { useParams, useRouter } from "next/navigation";
import { useGlobalStore } from "@/store/useGlobalStore";
import { motion } from "motion/react";
import { useFavorites } from "@/hooks/useFavorites";
import FavoriteButton from "./FavoriteButton";
import {
  Briefcase,
  DollarSign,
  TrendingUp,
  Users,
  Award,
  BookOpen,
  ArrowLeft,
  CheckCircle2,
  Target,
  Zap,
  MapPin,
  Globe,
  Building2,
  AlertCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CareerRole } from "@/types/career";

export default function CareerDetails() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params?.id[0] : params?.id ?? "";
  const { data, isLoading } = useCareerDetails(id);
  const { data: timsData } = useTimsCareerScoring(); // Fetch TIMS data for score/bridging
  const { language } = useGlobalStore();
  const router = useRouter();
  const { favorites, toggleFavorite } = useFavorites();
  const isFavorite = !!favorites.find((f) => f === id);
  const { t } = useTranslation();

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading career details...</p>
        </div>
      </div>
    );

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Career Not Found
        </h2>
        <p className="text-gray-600 mb-6">
          The career you are looking for does not exist or has been removed.
        </p>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const career = data as CareerRole;
  const title =
    career.title[language === "spanish" ? "es" : "en"] || career.title.en;
  const shortDesc =
    career.shortDescription?.[language === "spanish" ? "es" : "en"] ||
    career.shortDescription?.en;
  const longDesc =
    career.longDescription?.[language === "spanish" ? "es" : "en"] ||
    career.longDescription?.en;

  // Merge TIMS data if available
  const timsCareerList = timsData?.data?.careers;
  const scored = timsCareerList?.find(c => c.programId === career.id || c.programId === career.slug);
  const matchScore = scored ? Math.round(scored.totalScore) : Math.round(career.matchScore ?? 0);
  const needsBridging = scored?.needsBridging;
  const bridgingReasons = scored?.bridgingReasons;

  const formatCurrency = (amount?: number, currency = "USD") => {
    if (!amount) return "N/A";
    return new Intl.NumberFormat(language === "spanish" ? "es-ES" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-gray-50 pb-12"
    >
      {/* Hero Section */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center text-gray-500 hover:text-indigo-600 transition-colors mb-4 text-sm font-medium"
            aria-label={t("common.back", "Back to Careers")}
          >
            <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" />
            {t("common.back", "Back to Careers")}
          </button>

          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 text-2xl font-bold flex-shrink-0">
                {career.title.en?.charAt(0) || "C"}
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                  {title}
                </h1>
                <p className="text-gray-500 mt-1 max-w-2xl">{shortDesc}</p>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  {career.remoteEligible && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <Globe className="w-3 h-3 mr-1" aria-hidden="true" />
                      Remote Eligible
                    </span>
                  )}
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    <Building2 className="w-3 h-3 mr-1" aria-hidden="true" />
                    {(career.industries || [])[0] || "General"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 self-start md:self-center">
              <div className="flex flex-col items-end">
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">
                  Match Score
                </span>
                <div className="flex items-center gap-2">
                  <div className="text-3xl font-bold text-indigo-600">
                    {matchScore}%
                  </div>
                  <div className="relative w-8 h-8">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="16"
                        cy="16"
                        r="14"
                        fill="transparent"
                        stroke="#e5e7eb"
                        strokeWidth="3"
                        role="presentation"
                      />
                      <circle
                        cx="16"
                        cy="16"
                        r="14"
                        fill="transparent"
                        stroke="#4f46e5"
                        strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 14}`}
                        strokeDashoffset={`${2 * Math.PI * 14 * (1 - matchScore / 100)
                          }`}
                        strokeLinecap="round"
                        role="presentation"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="h-10 w-px bg-gray-200 mx-2"></div>
              <FavoriteButton
                isFavorite={isFavorite}
                onToggle={() => toggleFavorite(id)}
                className="p-3 hover:bg-gray-100 rounded-full transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Main Info */}
          <div className="lg:col-span-2 space-y-8">
            {/* About Section */}
            <section className="bg-white rounded-xl border border-gray-200 p-6" aria-labelledby="about-role-heading">
              <h2 id="about-role-heading" className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <BookOpen className="w-5 h-5 mr-2 text-indigo-500" aria-hidden="true" />
                {t("career.details.about", "About this Role")}
              </h2>
              <p className="text-gray-600 leading-relaxed whitespace-pre-line">
                {longDesc}
              </p>
            </section>

            {/* Bridging Section */}
            {needsBridging && bridgingReasons && bridgingReasons.length > 0 && (
              <section className="bg-amber-50 rounded-xl border border-amber-200 p-6" aria-labelledby="bridging-heading">
                <h2 id="bridging-heading" className="text-xl font-bold text-amber-900 mb-4 flex items-center">
                  <AlertCircle className="w-5 h-5 mr-2 text-amber-600" aria-hidden="true" />
                  {t("career.bridging.title", "Bridging Required")}
                </h2>
                <p className="text-amber-800 mb-4 font-medium">
                  {t("career.bridging.description", "To reach a high match score for this career, consider focusing on these areas:")}
                </p>
                <ul className="space-y-3">
                  {bridgingReasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start bg-white p-3 rounded-lg border border-amber-100 shadow-sm">
                      <div className="min-w-[20px] h-5 flex items-center justify-center mr-3 mt-0.5">
                        <span className="flex h-2 w-2 rounded-full bg-amber-500" />
                      </div>
                      <span className="text-gray-700">{reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Responsibilities */}
            {career.responsibilities && career.responsibilities.length > 0 && (
              <section className="bg-white rounded-xl border border-gray-200 p-6" aria-labelledby="responsibilities-heading">
                <h2 id="responsibilities-heading" className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                  <Target className="w-5 h-5 mr-2 text-indigo-500" aria-hidden="true" />
                  {t("career.details.responsibilities", "Key Responsibilities")}
                </h2>
                <ul className="space-y-3">
                  {career.responsibilities.map((resp, idx) => (
                    <li key={idx} className="flex items-start">
                      <CheckCircle2 className="w-5 h-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="text-gray-700">
                        {resp[language === "spanish" ? "es" : "en"] || resp.en}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Skills */}
            {career.skills && career.skills.length > 0 && (
              <section className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                  <Zap className="w-5 h-5 mr-2 text-indigo-500" aria-hidden="true" />
                  {t("career.details.requiredSkills", "Required Skills")}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {career.skills.map((skill) => (
                    <div
                      key={skill.skillId}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                    >
                      <span className="font-medium text-gray-800">
                        {skill.name[language === "spanish" ? "es" : "en"] ||
                          skill.name.en}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium capitalize
                        ${skill.levelRequired === "advanced"
                            ? "bg-purple-100 text-purple-700"
                            : skill.levelRequired === "intermediate"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-200 text-gray-700"
                          }`}
                      >
                        {t(`career.level.${skill.levelRequired}`, skill.levelRequired || "Not specified")}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Stats & Meta */}
          <div className="space-y-6">
            {/* Salary Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                {t("career.details.compensation", "Compensation")}
              </h3>
              <div className="flex items-center mb-2">
                <DollarSign className="w-8 h-8 text-green-600 mr-3" aria-hidden="true" />
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(
                      career.salaryRange?.median,
                      career.salaryRange?.currency
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t("career.details.medianSalary", "Median Annual Salary")}
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-sm text-gray-600">
                <span>{t("common.min", "Min")}: {formatCurrency(career.salaryRange?.min)}</span>
                <span>{t("common.max", "Max")}: {formatCurrency(career.salaryRange?.max)}</span>
              </div>
            </div>

            {/* Demand Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                {t("career.details.marketDemand", "Market Demand")}
              </h3>
              <div className="flex items-center mb-4">
                <TrendingUp className="w-8 h-8 text-blue-600 mr-3" aria-hidden="true" />
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {career.demandStats?.growthPercent
                      ? `+${(career.demandStats.growthPercent * 100).toFixed(
                        1
                      )}%`
                      : t("career.stable", "Stable")}
                  </div>
                  <div className="text-xs text-gray-500">{t("career.details.annualGrowth", "Annual Growth")}</div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t("career.details.openJobs", "Open Jobs")}</span>
                  <span className="font-medium">
                    {career.demandStats?.jobCount?.toLocaleString(language === "spanish" ? "es-ES" : "en-US")}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t("career.details.newJobs", "New (30d)")}</span>
                  <span className="font-medium text-green-600">
                    +{career.demandStats?.postedLast30Days?.toLocaleString(language === "spanish" ? "es-ES" : "en-US")}
                  </span>
                </div>
              </div>
            </div>

            {/* Education & Meta */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {t("career.details.requirements", "Requirements")}
              </h3>

              <div className="flex items-start">
                <Award className="w-5 h-5 text-gray-400 mr-3 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="block text-sm font-medium text-gray-900">
                    {t("career.details.educationLevel", "Education Level")}
                  </span>
                  <span className="block text-sm text-gray-500 capitalize">
                    {t(`career.education.${career.educationLevel}`, career.educationLevel || "Not specified")}
                  </span>
                </div>
              </div>

              <div className="flex items-start">
                <MapPin className="w-5 h-5 text-gray-400 mr-3 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="block text-sm font-medium text-gray-900">
                    {t("career.details.locations", "Locations")}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {career.locationSupport?.map((loc) => (
                      <span
                        key={loc}
                        className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                      >
                        {loc}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
