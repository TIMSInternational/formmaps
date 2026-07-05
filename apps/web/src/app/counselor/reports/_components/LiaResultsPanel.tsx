"use client";

/**
 * Counselor view of a student's full LIA/MIL report — the tims-suite
 * EmployeeLiaResults equivalent: fetches the latest completed parity-engine
 * session (canAccessUser-gated server side) and renders the same ResultsReport
 * the student sees, violations included.
 */
import { useEffect, useState } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { liaAssessmentApi, type LIAResults } from "@/services/liaService";
import { ResultsReport } from "@/app/dashboard/assessments/lia/_tims/ResultsReport";
import { Skeleton } from "@/components/ui/skeleton";

export function LiaResultsPanel({ studentId }: { studentId: string }) {
  const { language: storeLanguage } = useGlobalStore();
  const language: "es" | "en" = storeLanguage === "english" ? "en" : "es";

  const [results, setResults] = useState<LIAResults | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    liaAssessmentApi
      .getUserResults(studentId)
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (!results) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {language === "es"
          ? "Este estudiante aún no ha completado la evaluación MIL en el nuevo motor."
          : "This student has not completed the LIA assessment on the new engine yet."}
      </p>
    );
  }

  return <ResultsReport results={results} language={language} />;
}
