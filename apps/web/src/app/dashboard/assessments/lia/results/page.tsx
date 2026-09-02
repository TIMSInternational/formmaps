"use client";

/**
 * LIA / MIL results — tims-suite parity report (hero level card, percentile
 * bars, strengths/growth, per-subtest narrative, summary table) fed by the
 * new /api/v1/lia engine. Print + PDF export (PDF fed with REAL percentiles).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useGlobalStore } from "@/store/useGlobalStore";
import { liaAssessmentApi, SUBTEST_ORDER, type LIAResults } from "@/services/liaService";
import { getMILResults, type MILResultsData } from "@/services/milService";
import { SUBTEST_DESCRIPTIONS } from "@/data/liaReportContent";
import { buildLIAReportData } from "@/components/reports/buildLIAReportData";
import { ResultsReport } from "../_tims/ResultsReport";
import { ArrowLeft, Printer, AlertTriangle } from "lucide-react";

const ExportReportButton = dynamic(() => import("@/components/reports/ExportReportButton"), { ssr: false });

export default function LIAResultsPage() {
  const router = useRouter();
  const { language: storeLanguage, user } = useGlobalStore();
  const language: "es" | "en" = storeLanguage === "english" ? "en" : "es";

  const [results, setResults] = useState<LIAResults | null>(null);
  // A student whose cognitive assessment predates the tims-parity LIA engine has no
  // lia_assessment_session — /lia/user/{id}/results answers 404 — but /mil/results still
  // carries their legacy exam scores (that endpoint falls back to them, which is why the
  // assessments page calls them "completed" and links here). Without this fallback such a
  // student was sent from "View Results" straight to "you have not completed the LIA".
  const [legacy, setLegacy] = useState<MILResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const userId = user.id;
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await liaAssessmentApi.getUserResults(userId);
        if (!cancelled) setResults(data);
        return;
      } catch (err) {
        if ((err as { status?: number })?.status !== 404) {
          if (!cancelled) setError(true);
          return;
        }
      }
      try {
        const mil = await getMILResults(userId);
        const done = !!mil && mil.totalExams > 0 && mil.completedExams >= mil.totalExams;
        if (!cancelled) {
          if (done) setLegacy(mil);
          else setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#102B47] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (legacy && !results) {
    return <LegacyMilResults data={legacy} language={language} onBack={() => router.push("/dashboard")} />;
  }

  if (error || !results) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {language === "es" ? "Sin Resultados" : "No Results"}
          </h1>
          <p className="text-gray-600 mb-6">
            {language === "es"
              ? "Aún no has completado la evaluación MIL."
              : "You have not completed the LIA assessment yet."}
          </p>
          <button
            onClick={() => router.push("/dashboard/assessments/lia")}
            className="px-6 py-3 bg-[#102B47] hover:bg-[#0b1f33] text-white font-semibold rounded-xl"
          >
            {language === "es" ? "Ir a la Evaluación" : "Go to Assessment"}
          </button>
        </div>
      </div>
    );
  }

  // Feed the existing PDF with REAL percentiles from the parity engine.
  const liaReportData = buildLIAReportData({
    user: { id: user.id, name: user.name, email: user.email },
    overallScore: Math.round(results.global_percentile),
    subtests: SUBTEST_ORDER.map((subtest) => {
      const counts = results.response_counts?.[subtest];
      const answered = (counts?.correct || 0) + (counts?.incorrect || 0);
      return {
        name: SUBTEST_DESCRIPTIONS[subtest].name.en,
        score: Math.round(results.percentiles?.[subtest] ?? 0),
        accuracy: answered > 0 ? Math.round(((counts?.correct || 0) / answered) * 100) : 0,
      };
    }),
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            {language === "es" ? "Volver" : "Back"}
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50"
            >
              <Printer className="w-5 h-5" />
              {language === "es" ? "Imprimir" : "Print"}
            </button>
            <ExportReportButton
              reportType="lia"
              liaData={liaReportData}
              label={language === "es" ? "Descargar PDF" : "Download PDF"}
              variant="outline"
              className="h-10 gap-2 rounded-xl bg-[#102B47] text-white border-transparent hover:bg-[#0b1f33] shadow-sm"
              size="md"
            />
          </div>
        </div>
        <ResultsReport results={results} language={language} />
      </div>
    </div>
  );
}

/**
 * Legacy exam scores for a student with no parity LIA session. These are raw accuracy
 * percentages from the previous engine, NOT norm-referenced percentiles, so they are
 * shown as such — no performance band, no PDF export (that report is built from
 * percentiles the legacy data does not have).
 */
function LegacyMilResults({
  data,
  language,
  onBack,
}: {
  data: MILResultsData;
  language: "es" | "en";
  onBack: () => void;
}) {
  const es = language === "es";
  const completed = data.examResults.filter((e) => e.status === "completed");
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8">
          <ArrowLeft className="w-5 h-5" />
          {es ? "Volver" : "Back"}
        </button>
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            {es ? "Resultados de la Evaluación LIA" : "LIA Assessment Results"}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {es
              ? "Puntajes de precisión de la versión anterior de la evaluación. No son percentiles normativos."
              : "Accuracy scores from the previous version of the assessment. These are not norm-referenced percentiles."}
          </p>
          <div className="flex items-baseline gap-2 mb-8">
            <span className="text-5xl font-bold text-[#102B47] tabular-nums">{Math.round(data.overallScore)}%</span>
            <span className="text-gray-600">{es ? "promedio general" : "overall average"}</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {completed.map((exam) => {
              const total = exam.totalQuestions ?? 0;
              return (
                <li key={exam.examId} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium text-gray-900">{exam.examName}</div>
                    {total > 0 && (
                      <div className="text-xs text-gray-500">
                        {exam.correctAnswers ?? 0}/{total} {es ? "correctas" : "correct"}
                      </div>
                    )}
                  </div>
                  <span className="text-lg font-semibold text-gray-900 tabular-nums">
                    {Math.round(exam.scorePercentage ?? 0)}%
                  </span>
                </li>
              );
            })}
          </ul>
          {data.lastCompletedAt && (
            <p className="text-xs text-gray-400 mt-6">
              {es ? "Completada el " : "Completed on "}
              {new Date(data.lastCompletedAt).toLocaleDateString(es ? "es" : "en")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
