"use client";

import { motion } from "motion/react";
import { usePCAData } from "@/hooks/usePCAData";
import { useTranslation } from "react-i18next";
import {
  Brain,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

interface PCAResultsProps {
  className?: string;
  pcaDataProp?: any;
}

export function PCAResults({ className, pcaDataProp }: PCAResultsProps) {
  const customHookParams = usePCAData();
  const loading = !pcaDataProp && customHookParams.loading;
  const error = customHookParams.error;

  // if pcaDataProp is received, map it to match pcaData format.
  // We expect pcaDataProp to have { pcaCod, date } arrays.
  const mappedData =
    pcaDataProp && pcaDataProp.length > 0
      ? {
          status: "completed",
          pcaCod: pcaDataProp[0].pcaCod || pcaDataProp[0].PcaCod,
          results: {
            data: {
              // Use real DISC scores from API data if available
              pcaD1: pcaDataProp[0].pcaD1 ?? pcaDataProp[0].PcaD1 ?? null,
              pcaI1: pcaDataProp[0].pcaI1 ?? pcaDataProp[0].PcaI1 ?? null,
              pcaS1: pcaDataProp[0].pcaS1 ?? pcaDataProp[0].PcaS1 ?? null,
              pcaC1: pcaDataProp[0].pcaC1 ?? pcaDataProp[0].PcaC1 ?? null,
            },
          },
        }
      : customHookParams.pcaData;

  const pcaData = mappedData;
  const hasPCA = !!pcaDataProp || customHookParams.hasPCA;
  const isCompleted =
    (pcaDataProp && pcaDataProp.length > 0) || customHookParams.isCompleted;
  const refreshPCAData = customHookParams.refreshPCAData;

  // Check if we have real DISC scores or just a pending assessment
  const hasRealScores = pcaData?.results?.data &&
    (pcaData.results.data.pcaD1 != null || pcaData.results.data.pcaI1 != null);

  const { t } = useTranslation();

  const getTopCompetencies = () => {
    if (!pcaData?.results?.data) {
      return [];
    }

    const data = pcaData.results.data;

    // Map the PCA scores to competencies based on the API response structure
    const competencies = [
      {
        name: "Dominance",
        score: data.pcaD1 || 0,
        color: "bg-red-500",
        bg: "bg-red-50",
      },
      {
        name: "Influence",
        score: data.pcaI1 || 0,
        color: "bg-yellow-500",
        bg: "bg-yellow-50",
      },
      {
        name: "Steadiness",
        score: data.pcaS1 || 0,
        color: "bg-green-500",
        bg: "bg-green-50",
      },
      {
        name: "Conscientiousness",
        score: data.pcaC1 || 0,
        color: "bg-blue-500",
        bg: "bg-blue-50",
      },
    ];

    // Sort by score descending and return top 4
    return competencies.sort((a, b) => b.score - a.score).slice(0, 4);
  };

  const getOverallScore = () => {
    if (!pcaData?.results?.data) return 0;

    const data = pcaData.results.data;

    // Calculate average of the four main DISC dimensions
    const scores = [
      data.pcaD1 || 0,
      data.pcaI1 || 0,
      data.pcaS1 || 0,
      data.pcaC1 || 0,
    ];

    const validScores = scores.filter((score) => score > 0);
    if (validScores.length === 0) return 0;

    return Math.round(
      validScores.reduce((sum, score) => sum + score, 0) / validScores.length,
    );
  };

  if (loading) {
    return (
      <Card className={cn("p-6 h-full glass-card", className)}>
        <div className="animate-pulse space-y-4">
          <div className="flex justify-between">
            <div className="h-10 w-10 bg-slate-100 rounded-xl"></div>
            <div className="h-8 w-16 bg-slate-100 rounded-lg"></div>
          </div>
          <div className="h-6 bg-slate-100 rounded w-1/3"></div>
          <div className="space-y-3 pt-4">
            <div className="h-2 bg-slate-100 rounded-full"></div>
            <div className="h-2 bg-slate-100 rounded-full w-5/6"></div>
            <div className="h-2 bg-slate-100 rounded-full w-4/6"></div>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        className={cn(
          "p-6 h-full flex flex-col items-center justify-center text-center glass-card",
          className,
        )}
      >
        <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          {t("dashboard.pcaErrorTitle")}
        </h3>
        <p className="text-sm text-gray-500 mb-6 max-w-[200px]">{error}</p>
        <button
          onClick={refreshPCAData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          {t("common.tryAgain")}
        </button>
      </Card>
    );
  }

  if (!hasPCA) {
    return (
      <Card
        className={cn(
          "p-6 h-full flex flex-col justify-between glass-card",
          className,
        )}
      >
        <div>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Brain className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-xl font-sans font-semibold text-slate-900">
                {t("dashboard.pcaAssessment")}
              </h3>
              <p className="text-sm text-slate-500">
                Discover your professional DNA
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
            <BarChart3 className="w-12 h-12 text-slate-200 mb-3" />
            <p className="text-slate-600 text-sm mb-6 max-w-[240px]">
              {pcaData?.status === "not_found"
                ? t("dashboard.noPCACreated")
                : t("dashboard.noPCACompleted")}
            </p>
          </div>
        </div>

        <a
          href="/dashboard/assessments/pca"
          className={cn(buttonVariants({ variant: "default" }), "w-full py-3")}
        >
          <span>{t("dashboard.startAssessment")}</span>
          <ArrowRight className="w-4 h-4" />
        </a>
      </Card>
    );
  }

  // Show in-progress status
  if (hasPCA && !isCompleted) {
    return (
      <Card
        className={cn(
          "p-6 h-full flex flex-col justify-between glass-card",
          className,
        )}
      >
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                <Brain className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-xl font-sans font-semibold text-slate-900">
                  {t("dashboard.pcaInProgress")}
                </h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 mt-1">
                  In Progress
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <p className="text-slate-600 text-sm mb-4 leading-relaxed">
              {pcaData?.status === "in_progress"
                ? t("dashboard.pcaProcessing")
                : t("dashboard.pcaStarted")}
            </p>

            {pcaData?.pcaCod && (
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 mb-4 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                  {t("dashboard.assessmentCode")}
                </span>
                <span className="font-mono text-sm font-bold text-slate-900">
                  {pcaData.pcaCod}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-auto">
          <button
            onClick={refreshPCAData}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-full py-2.5",
            )}
          >
            <RefreshCw className="w-4 h-4" />
            {t("dashboard.checkStatus")}
          </button>
          <a
            href="/dashboard/assessments/pca"
            className={cn(
              buttonVariants({ variant: "default" }),
              "w-full py-2.5 !bg-amber-600 hover:!bg-amber-700",
            )}
          >
            <span>Continue</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </Card>
    );
  }

  const competencies = getTopCompetencies();
  const overallScore = getOverallScore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full"
    >
      <Card
        className={cn(
          "p-6 h-full flex flex-col justify-between glass-card",
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Brain className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-xl font-sans font-semibold text-slate-900">
                {t("dashboard.pcaAssessment")}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {hasRealScores ? "Analysis Complete" : "Results Pending"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-sans font-bold text-indigo-600">
              {hasRealScores ? `${overallScore}%` : "—"}
            </div>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-1">
              {hasRealScores ? t("dashboard.overallScore") : "Awaiting TIMS"}
            </div>
          </div>
        </div>

        {/* Competencies */}
        <div className="space-y-4 mb-8 flex-1">
          {competencies.map((competency, index) => (
            <div key={`${competency.name}-${index}`} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">
                  {competency.name}
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {competency.score}%
                </span>
              </div>
              <div
                className={cn(
                  "w-full rounded-full h-2 overflow-hidden",
                  competency.bg,
                )}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${competency.score}%` }}
                  transition={{
                    delay: index * 0.1,
                    duration: 0.8,
                    ease: "easeOut",
                  }}
                  className={cn("h-full rounded-full", competency.color)}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-auto pt-6 border-t border-slate-100/50">
          <a
            href="/dashboard/assessments/pca"
            className={cn(
              buttonVariants({ variant: "default" }),
              "flex-1 py-2.5",
            )}
          >
            <span>{t("common.view")}</span>
            <ChevronRight className="w-4 h-4 ml-1" />
          </a>
          <button
            onClick={refreshPCAData}
            className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
            title={t("common.refresh")}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Footer Info */}
        <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400 font-medium tracking-wide">
          <span>CODE {pcaData?.pcaCod || "N/A"}</span>
          <span>
            {(pcaData as any)?.lastUpdated
              ? new Date((pcaData as any).lastUpdated).toLocaleDateString()
              : new Date().toLocaleDateString()}
          </span>
        </div>
      </Card>
    </motion.div>
  );
}
