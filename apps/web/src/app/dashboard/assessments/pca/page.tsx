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
import { RequireChromium } from "@/components/proctoring/RequireChromium";
import { ProctoredShell } from "@/components/proctoring/ProctoredShell";
import { useProctoring } from "@/components/proctoring/useProctoring";
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
  const { user, setAssessmentActive } = useGlobalStore();
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

  // While the PCA survey iframe is open, mark an assessment in progress so the
  // AI chat is blocked/closed. Clears on close or unmount.
  useEffect(() => {
    setAssessmentActive(!!assessmentUrl);
    return () => setAssessmentActive(false);
  }, [assessmentUrl, setAssessmentActive]);

  // Proctoring for the embedded survey. Honest limit: the survey is a
  // cross-origin iframe, so DOM clipboard/key listeners cannot reach inside it —
  // only fullscreen, tab-switch (visibility), window blur, and second-monitor
  // detection apply. The external survey exposes no local PCAExamSession id, so
  // there is no session to flush violations to from this page (documented).
  const proctoring = useProctoring();
  // Depend on the individually-stable callbacks (not the whole `proctoring`
  // object, which changes reference every render as its elapsed clock ticks) so
  // this effect fires only when the assessment actually starts/stops.
  const { begin: beginProctoring, end: endProctoring } = proctoring;
  useEffect(() => {
    if (assessmentUrl) beginProctoring();
    else endProctoring();
  }, [assessmentUrl, beginProctoring, endProctoring]);

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
        PerNumIde: `${user.id.slice(-8)}-${Date.now().toString(36)}`,
        PerGen: selectedGender,
        PerMail: user.email,
        JcaCod: selectedJCA,
        BillingCenter: "",
      };

      const result = await addPCAEvaluation(
        user.id,
        userData,
        selectedLanguage
      );

      if (result.success && result.assessmentUrl) {
        // PcaLink from TIMS is a direct assessment URL — embed in iframe (no login required)
        setAssessmentUrl(result.assessmentUrl);
        toast.success(t("dashboard.assessmentStarted", "Assessment started. Complete it below."));
      } else {
        toast.error(result.message || t("dashboard.failedToCreateAssessment", "Failed to create assessment"));
        // If the assessment is already completed (server blocks a retake), re-sync
        // so the screen flips to View Results instead of offering Start again.
        refreshPCAData();
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

  // Embedded assessment mode — PcaLink from TIMS loads the assessment directly (no login)
  if (assessmentUrl) {
    return (
      <RequireChromium>
        <ProctoredShell proctoring={proctoring} watermark={user?.email ? { email: user.email } : undefined}>
          <div className="min-h-screen bg-background">
            <div className="bg-card border-b border-border px-4 py-3">
              <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setAssessmentUrl(null); refreshPCAData(); }}
                    className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    {t("dashboard.backToConfiguration", "Back to Configuration")}
                  </button>
                  <span className="text-border">|</span>
                  <span className="text-sm font-semibold text-foreground">
                    {t("dashboard.pcaTitle", "Personal Competence Analysis (PCA)")}
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-secondary px-2.5 py-1 rounded-md border border-border">
                  {t("dashboard.assessmentInProgress", "Assessment In Progress")}
                </span>
              </div>
            </div>
            <p className="max-w-7xl mx-auto px-4 py-2 text-[11px] text-muted-foreground">
              {t("proctoring.iframeClipboardNote")}
            </p>
            <div className="h-[calc(100vh-93px)]">
              <iframe
                src={assessmentUrl}
                className="w-full h-full border-0"
                title="PCA Assessment"
                allow="fullscreen"
              />
            </div>
          </div>
        </ProctoredShell>
      </RequireChromium>
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
              <div className="w-9 h-9 rounded-lg bg-[#102B47]/5 flex items-center justify-center">
                <Brain className="w-4.5 h-4.5 text-[#2E9098]" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-foreground text-sm">
                  {t("dashboard.viewResults", "View Results")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  See your PCA personality profile and competency breakdown
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
                  {hasPCA
                    ? t("dashboard.resumePCA", "Resume Assessment")
                    : t("dashboard.startPCA")}
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
                  <CheckCircle2 className="w-3 h-3 text-[#2E9098] mt-0.5 shrink-0" />
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
