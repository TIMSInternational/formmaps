"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { usePCAData } from "@/hooks/usePCAData";
import {
  addPCAEvaluation,
  JCACode,
} from "@/services/pcaService";
import PCAResultsPanel from "../_components/PCAResultsPanel";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Brain,
  CheckCircle2,
  Clock,
  Shield,
  Globe,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function PCAAssessmentPage() {
  const { user } = useGlobalStore();
  const { t } = useTranslation();
  const { pcaData, loading, error, refreshPCAData, hasPCA, isCompleted } =
    usePCAData();

  const searchParams = useSearchParams();

  const [selectedLanguage, setSelectedLanguage] = useState<
    "spanish" | "english"
  >("spanish");
  const [selectedJCA, setSelectedJCA] = useState<JCACode>("GTCML");
  const [selectedGender, setSelectedGender] = useState<"M" | "F">("M");
  const [isCreating, setIsCreating] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [assessmentUrl, setAssessmentUrl] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("showResults") === "true" && hasPCA && isCompleted && pcaData?.pcaCod) {
      setShowResults(true);
    }
  }, [searchParams, hasPCA, isCompleted, pcaData]);

  const handleStartAssessment = async () => {
    if (!user?.id || !user?.name || !user?.email) {
      toast.error(t("dashboard.pcaUserInfoIncomplete"));
      return;
    }

    setIsCreating(true);
    try {
      const userData = {
        PerNom: user.name.split(" ")[0] || "User",
        PerApe: user.name.split(" ").slice(1).join(" ") || "Name",
        PerNumIde: user.id.slice(-8),
        PerGen: selectedGender,
        permail: user.email,
        JcaCod: selectedJCA,
        BillingCenter: "",
        UserMail: user.email,
      };

      const result = await addPCAEvaluation(
        user.id,
        userData,
        selectedLanguage
      );

      if (result.success && result.assessmentUrl) {
        // Open PCA survey in new tab (TIMS has mixed content issues that break iframes)
        window.open(result.assessmentUrl, "_blank", "noopener,noreferrer");
        toast.success(t("dashboard.assessmentStarted", "Assessment opened in a new tab. Complete it there and return here to view results."));
        setTimeout(() => {
          refreshPCAData();
        }, 5000);
      } else {
        toast.error(result.message || t("dashboard.failedToCreateAssessment", "Failed to create assessment"));
      }
    } catch (error) {
      toast.error(t("dashboard.failedToCreateAssessment", "Failed to create assessment. Please try again."));
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading PCA data...</p>
        </div>
      </div>
    );
  }

  // Assessment opened in new tab — show waiting state
  if (assessmentUrl) {
    return (
      <div className="max-w-4xl mx-auto py-6">
        <Link
          href="/dashboard/assessments"
          className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          {t("dashboard.assessments", "Assessments")}
        </Link>
        <div className="dash-card p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6 text-blue-600 animate-pulse" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("dashboard.assessmentInProgress", "Assessment In Progress")}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {t("dashboard.assessmentOpenedInTab", "Your PCA assessment is open in another tab. Complete it there and click the button below to check your results.")}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={() => window.open(assessmentUrl, "_blank")}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-secondary transition-colors"
            >
              {t("dashboard.reopenAssessment", "Reopen Assessment")}
            </button>
            <button
              onClick={() => { setAssessmentUrl(null); refreshPCAData(); }}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              {t("dashboard.checkResults", "Check Results")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6">
      {/* Back link */}
      <Link
        href="/dashboard/assessments"
        className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        {t("dashboard.assessments", "Assessments")}
      </Link>

      {/* Header row */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {t("dashboard.pcaTitle")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t("dashboard.pcaDescription")}
          </p>
        </div>
        {hasPCA && isCompleted && (
          <div className="px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center gap-1.5 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[11px] font-semibold text-emerald-700">
              {t("dashboard.assessmentCompleted")}
            </span>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="space-y-4"
      >
        {/* Completed: View Results */}
        {hasPCA && isCompleted && (
          <button
            onClick={() => setShowResults(true)}
            className="w-full dash-card p-4 flex items-center justify-between hover:border-foreground/20 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Brain className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-foreground text-sm">
                  {t("dashboard.viewResults", "View Results")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  See your DISC personality profile and competency breakdown
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
        )}

        {/* Not completed: Configuration */}
        {(!hasPCA || !isCompleted) && (
          <div className="dash-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-0.5">
                {t("dashboard.assessmentConfiguration")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("dashboard.selectAssessmentLanguage")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "spanish" as const, flag: "\u{1F1EA}\u{1F1F8}", label: t("language.spanish"), sub: t("dashboard.spanishAssessment") },
                { key: "english" as const, flag: "\u{1F1FA}\u{1F1F8}", label: t("language.english"), sub: t("dashboard.englishAssessment") },
              ].map((lang) => (
                <button
                  key={lang.key}
                  onClick={() => setSelectedLanguage(lang.key)}
                  className={cn(
                    "p-3 rounded-xl border-2 transition-all text-center",
                    selectedLanguage === lang.key
                      ? "border-foreground bg-secondary"
                      : "border-border hover:border-foreground/20"
                  )}
                >
                  <div className="text-xl mb-1">{lang.flag}</div>
                  <div className="text-sm font-semibold text-foreground">{lang.label}</div>
                  <div className="text-[10px] text-muted-foreground">{lang.sub}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "M" as const, label: t("common.male", "Male") },
                { key: "F" as const, label: t("common.female", "Female") },
              ].map((g) => (
                <button
                  key={g.key}
                  onClick={() => setSelectedGender(g.key)}
                  className={cn(
                    "p-2.5 rounded-xl border-2 transition-all text-center text-sm font-semibold",
                    selectedGender === g.key
                      ? "border-foreground bg-secondary text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/20"
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleStartAssessment}
              disabled={isCreating}
              className="w-full py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-colors bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("dashboard.creatingAssessment")}
                </>
              ) : (
                <>
                  {t("dashboard.startPCA")}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Info Cards — side by side, compact */}
        <div className="grid grid-cols-2 gap-3">
          <div className="dash-card p-4">
            <h3 className="text-xs font-semibold text-foreground mb-2">
              {t("dashboard.whatIsPCA")}
            </h3>
            <ul className="space-y-1.5">
              {[
                t("dashboard.pcaEvaluates"),
                t("dashboard.pcaStrengths"),
                t("dashboard.pcaJobMatching"),
                t("dashboard.pcaLanguages"),
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-tight">
                  <CheckCircle2 className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="dash-card p-4">
            <h3 className="text-xs font-semibold text-foreground mb-2">
              {t("dashboard.assessmentDetails")}
            </h3>
            <ul className="space-y-1.5">
              {[
                { icon: Clock, text: t("dashboard.pcaDuration") },
                { icon: Shield, text: t("dashboard.pcaFormat") },
                { icon: CheckCircle2, text: t("dashboard.pcaImmediateResults") },
                { icon: Globe, text: t("dashboard.pcaSecurePlatform") },
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-tight">
                  <item.icon className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>

      {/* Results Panel */}
      {showResults && pcaData?.pcaCod && (
        <PCAResultsPanel
          pcaCod={pcaData.pcaCod}
          userId={user.id || ""}
          onClose={() => setShowResults(false)}
        />
      )}
    </div>
  );
}
