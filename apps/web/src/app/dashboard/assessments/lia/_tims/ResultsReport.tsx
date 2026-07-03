"use client";

/**
 * LIA results report — verbatim port of the tims-suite LIAResults body:
 * hero level card, MIL intro, per-subtest percentile bars with median tick,
 * strengths (top-2) / growth areas (bottom-2), per-subtest interpretation +
 * strategies, summary table with totals row, assessment details, violations.
 * Reused by the student results page and the counselor panel.
 */
import type { ReactNode } from "react";
import {
  type LIAResults as LIAResultsType,
  type LIASubtest,
  type LIAPerformanceLevel,
  SUBTEST_ORDER,
  SUBTEST_CONFIG,
} from "@/services/liaService";
import {
  SUBTEST_DESCRIPTIONS,
  SUBTEST_LEVEL_CONTENT,
  PERFORMANCE_LEVEL_DISPLAY,
  GLOBAL_PERFORMANCE_DESCRIPTIONS,
  MIL_INTRO_TEXT,
} from "@/data/liaReportContent";
import { Eye, MessageSquare, Hash, Brain, Shuffle, AlertTriangle, TrendingUp, Target, Lightbulb } from "lucide-react";

const LEVEL_HERO_COLORS: Record<LIAPerformanceLevel, { bg: string; text: string }> = {
  insufficient: { bg: "bg-red-500", text: "text-red-600" },
  low: { bg: "bg-amber-500", text: "text-amber-600" },
  acceptable: { bg: "bg-blue-500", text: "text-blue-600" },
  high: { bg: "bg-emerald-500", text: "text-emerald-600" },
  outstanding: { bg: "bg-violet-500", text: "text-violet-600" },
};

const LEVEL_BG_COLORS: Record<LIAPerformanceLevel, string> = {
  insufficient: "bg-red-100 text-red-700",
  low: "bg-amber-100 text-amber-700",
  acceptable: "bg-blue-100 text-blue-700",
  high: "bg-emerald-100 text-emerald-700",
  outstanding: "bg-violet-100 text-violet-700",
};

const subtestIcons: Record<LIASubtest, ReactNode> = {
  pattern_recognition: <Eye className="w-5 h-5" />,
  verbal_reasoning: <MessageSquare className="w-5 h-5" />,
  numerical_speed: <Hash className="w-5 h-5" />,
  working_memory: <Brain className="w-5 h-5" />,
  visual_rotation: <Shuffle className="w-5 h-5" />,
};

function InsightSection({
  title,
  icon,
  children,
  variant = "default",
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  variant?: "default" | "highlight";
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-200 p-6 ${variant === "highlight" ? "bg-[#102B47]/5" : "bg-white"}`}
    >
      <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
        {icon && <span>{icon}</span>}
        {title}
      </h2>
      {children}
    </div>
  );
}

export function ResultsReport({ results, language }: { results: LIAResultsType; language: "es" | "en" }) {
  const performanceLevel = results.performance_level;
  const heroColors = LEVEL_HERO_COLORS[performanceLevel];

  const totalQuestions = Object.values(SUBTEST_CONFIG).reduce((acc, c) => acc + c.itemCount, 0);
  const totalAnswered = Object.values(results.response_counts || {}).reduce(
    (acc, c) => acc + (c?.correct || 0) + (c?.incorrect || 0),
    0,
  );
  const totalCorrect = Object.values(results.response_counts || {}).reduce((acc, c) => acc + (c?.correct || 0), 0);

  const subtestPercentiles = SUBTEST_ORDER.map((subtest) => ({
    subtest,
    percentile: results.percentiles?.[subtest] ?? 0,
    level: (results.subtest_performance_levels?.[subtest] || "acceptable") as LIAPerformanceLevel,
  })).sort((a, b) => b.percentile - a.percentile);

  const strongestSubtests = subtestPercentiles.slice(0, 2);
  const weakestSubtests = subtestPercentiles.slice(-2).reverse();

  return (
    <div className="space-y-6">
      {/* Hero: Performance Level Card */}
      <div className={`${heroColors.bg} text-white rounded-2xl p-8`}>
        <div className="text-center">
          <div className="text-sm uppercase tracking-wider opacity-75 mb-2">
            {language === "es" ? "Medición de Inteligencia Laboral" : "Labor Intelligence Measurement"}
          </div>
          <div className="text-4xl font-bold mb-2">{PERFORMANCE_LEVEL_DISPLAY[performanceLevel][language]}</div>
          <div className="text-xl font-medium opacity-90 italic">
            &ldquo;{GLOBAL_PERFORMANCE_DESCRIPTIONS[performanceLevel][language]}&rdquo;
          </div>
          <div className="text-3xl font-bold mt-4">
            {results.global_percentile}%
            <span className="text-lg font-normal ml-2 opacity-75">
              {language === "es" ? "percentil global" : "global percentile"}
            </span>
          </div>
          <div className="mt-4 text-sm opacity-75">{results.user_name}</div>
        </div>
      </div>

      {/* About MIL */}
      <InsightSection title={language === "es" ? "Acerca de esta Evaluación" : "About this Assessment"}>
        <p className="text-gray-700 leading-relaxed">{MIL_INTRO_TEXT[language]}</p>
      </InsightSection>

      {/* Subtest Breakdown */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">
          {language === "es" ? "Desglose por Subprueba" : "Subtest Breakdown"}
        </h2>
        <div className="space-y-6">
          {SUBTEST_ORDER.map((subtest) => {
            const config = SUBTEST_CONFIG[subtest];
            const percentile = results.percentiles?.[subtest] ?? 0;
            const level = (results.subtest_performance_levels?.[subtest] || "acceptable") as LIAPerformanceLevel;
            const description = SUBTEST_DESCRIPTIONS[subtest];
            const responseCounts = results.response_counts?.[subtest];
            const realized = (responseCounts?.correct || 0) + (responseCounts?.incorrect || 0);
            const correct = responseCounts?.correct || 0;

            return (
              <div key={subtest}>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[#2E9098]">{subtestIcons[subtest]}</span>
                    <span className="text-sm font-medium text-gray-700">{description.name[language]}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_BG_COLORS[level]}`}>
                      {PERFORMANCE_LEVEL_DISPLAY[level][language]}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{Math.round(percentile)}%</span>
                  </div>
                </div>
                <div className="relative h-8 bg-gray-100 rounded-full overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-px h-full bg-gray-300" style={{ left: "50%" }} />
                  </div>
                  <div
                    className="absolute top-1 bottom-1 bg-[#102B47] rounded-full transition-all"
                    style={{ width: `${percentile}%` }}
                  />
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-gray-500">
                    {realized}/{config.itemCount} {language === "es" ? "respondidas" : "answered"} • {correct}{" "}
                    {language === "es" ? "correctas" : "correct"}
                  </span>
                  <span className="text-xs text-gray-500">{language === "es" ? "percentil" : "percentile"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strengths */}
      <InsightSection
        title={language === "es" ? "Fortalezas" : "Strengths"}
        icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
        variant="highlight"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strongestSubtests.map(({ subtest, percentile, level }) => {
            const description = SUBTEST_DESCRIPTIONS[subtest];
            const content = SUBTEST_LEVEL_CONTENT[subtest][level];
            return (
              <div key={subtest} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3">
                <span className="text-2xl flex-shrink-0 text-emerald-500">{subtestIcons[subtest]}</span>
                <div>
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    {description.name[language]}
                    <span className="text-sm font-normal text-emerald-600">({Math.round(percentile)}%)</span>
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{content.interpretations[language][0]}</p>
                </div>
              </div>
            );
          })}
        </div>
      </InsightSection>

      {/* Growth Areas */}
      <InsightSection
        title={language === "es" ? "Áreas de Desarrollo" : "Growth Areas"}
        icon={<Target className="w-5 h-5 text-amber-500" />}
      >
        <div className="space-y-4">
          {weakestSubtests.map(({ subtest, percentile, level }) => {
            const description = SUBTEST_DESCRIPTIONS[subtest];
            const content = SUBTEST_LEVEL_CONTENT[subtest][level];
            return (
              <div key={subtest} className="flex gap-3">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">{subtestIcons[subtest]}</span>
                <div>
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    {description.name[language]}
                    <span className="text-sm font-normal text-amber-600">({Math.round(percentile)}%)</span>
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{content.interpretations[language][0]}</p>
                </div>
              </div>
            );
          })}
        </div>
      </InsightSection>

      {/* Detailed Subtest Analysis */}
      {SUBTEST_ORDER.map((subtest) => {
        const description = SUBTEST_DESCRIPTIONS[subtest];
        const level = (results.subtest_performance_levels?.[subtest] || "acceptable") as LIAPerformanceLevel;
        const content = SUBTEST_LEVEL_CONTENT[subtest][level];
        const percentile = results.percentiles?.[subtest] ?? 0;
        const responseCounts = results.response_counts?.[subtest];
        const realized = (responseCounts?.correct || 0) + (responseCounts?.incorrect || 0);
        const correct = responseCounts?.correct || 0;

        return (
          <InsightSection key={subtest} title={description.name[language]} icon={subtestIcons[subtest]}>
            <p className="text-gray-700 leading-relaxed mb-4">{description.description[language]}</p>
            <div className="flex items-center gap-4 mb-4 text-sm">
              <span className={`px-3 py-1 rounded-full font-medium ${LEVEL_BG_COLORS[level]}`}>
                {PERFORMANCE_LEVEL_DISPLAY[level][language]}
              </span>
              <span className="text-gray-600">
                {Math.round(percentile)}% {language === "es" ? "percentil" : "percentile"}
              </span>
              <span className="text-gray-600">
                {correct}/{realized} {language === "es" ? "correctas" : "correct"}
              </span>
            </div>
            <h4 className="text-sm font-semibold text-gray-900 mb-2">
              {language === "es" ? "Interpretación" : "Interpretation"}
            </h4>
            <ul className="space-y-2 mb-4">
              {content.interpretations[language].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-[#2E9098] mt-0.5 flex-shrink-0">*</span>
                  {item}
                </li>
              ))}
            </ul>
            <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              {language === "es" ? "Estrategias de Adaptación" : "Adaptation Strategies"}
            </h4>
            <ul className="space-y-2">
              {content.strategies[language].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-emerald-500 mt-0.5 flex-shrink-0">*</span>
                  {item}
                </li>
              ))}
            </ul>
          </InsightSection>
        );
      })}

      {/* Results Summary Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {language === "es" ? "Resumen de Resultados" : "Results Summary"}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  {language === "es" ? "Evaluación" : "Evaluation"}
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Total</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                  {language === "es" ? "Realizados" : "Completed"}
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                  {language === "es" ? "Correctos" : "Correct"}
                </th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                  {language === "es" ? "Percentil" : "Percentile"}
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  {language === "es" ? "Nivel" : "Level"}
                </th>
              </tr>
            </thead>
            <tbody>
              {SUBTEST_ORDER.map((subtest) => {
                const config = SUBTEST_CONFIG[subtest];
                const responseCounts = results.response_counts?.[subtest];
                const realized = (responseCounts?.correct || 0) + (responseCounts?.incorrect || 0);
                const correct = responseCounts?.correct || 0;
                const level = (results.subtest_performance_levels?.[subtest] || "acceptable") as LIAPerformanceLevel;
                const percentile = results.percentiles?.[subtest] ?? 0;
                return (
                  <tr key={subtest} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm text-gray-900">{SUBTEST_DESCRIPTIONS[subtest].name[language]}</td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">{config.itemCount}</td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">{realized}</td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">{correct}</td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">{Math.round(percentile)}%</td>
                    <td className="px-6 py-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${LEVEL_BG_COLORS[level]}`}>
                        {PERFORMANCE_LEVEL_DISPLAY[level][language]}
                      </span>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-medium">
                <td className="px-6 py-3 text-sm text-gray-900">Total</td>
                <td className="px-4 py-3 text-center text-sm text-gray-700">{totalQuestions}</td>
                <td className="px-4 py-3 text-center text-sm text-gray-700">{totalAnswered}</td>
                <td className="px-4 py-3 text-center text-sm text-gray-700">{totalCorrect}</td>
                <td className="px-4 py-3 text-center text-sm font-bold text-gray-900">{results.global_percentile}%</td>
                <td className="px-6 py-3">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${LEVEL_BG_COLORS[performanceLevel]}`}
                  >
                    {PERFORMANCE_LEVEL_DISPLAY[performanceLevel][language]}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Assessment Details */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {language === "es" ? "Detalles de la Evaluación" : "Assessment Details"}
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">{language === "es" ? "Fecha de completación" : "Completed at"}:</span>
            <p className="font-medium text-gray-900">
              {new Date(results.completed_at).toLocaleString(language === "es" ? "es-ES" : "en-US")}
            </p>
          </div>
          <div>
            <span className="text-gray-500">{language === "es" ? "Preguntas respondidas" : "Questions answered"}:</span>
            <p className="font-medium text-gray-900">
              {totalAnswered}/{totalQuestions}
            </p>
          </div>
          <div>
            <span className="text-gray-500">{language === "es" ? "Percentil global" : "Global percentile"}:</span>
            <p className="font-medium text-gray-900">{results.global_percentile}%</p>
          </div>
          <div>
            <span className="text-gray-500">{language === "es" ? "Nivel de desempeño" : "Performance level"}:</span>
            <p className="font-medium text-gray-900">{PERFORMANCE_LEVEL_DISPLAY[performanceLevel][language]}</p>
          </div>
        </div>
      </div>

      {/* Violations */}
      {results.violation_count > 0 && results.lockdown_violations && (
        <div className="bg-orange-50 rounded-xl p-6 border border-orange-200">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-orange-500" />
            <h3 className="font-semibold text-orange-700">
              {language === "es" ? "Violaciones Detectadas" : "Violations Detected"}
            </h3>
            <span className="ml-auto px-2 py-1 bg-orange-200 text-orange-700 rounded-full text-xs font-medium">
              {results.violation_count} total
            </span>
          </div>
          <ul className="space-y-2 text-sm text-orange-700">
            {results.lockdown_violations.slice(0, 5).map((v, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-orange-500 mt-0.5">*</span>
                <span>
                  {v.type} - {new Date(v.timestamp).toLocaleTimeString()}
                  {v.details && ` (${v.details})`}
                </span>
              </li>
            ))}
            {results.lockdown_violations.length > 5 && (
              <li className="text-orange-600">
                ... {language === "es" ? "y" : "and"} {results.lockdown_violations.length - 5}{" "}
                {language === "es" ? "más" : "more"}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
