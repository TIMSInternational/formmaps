import { CheckCircle2, Circle } from "lucide-react";
import type { VocationalScoreOutcome, IntegratedOutcome } from "@/services/vocationalReportService";

const CARD = "bg-white rounded-xl shadow-sm border border-gray-100 p-5";

function Row({ label, ready, hint }: { label: string; ready: boolean; hint: string }) {
  return (
    <li className="flex items-start gap-3">
      {ready
        ? <CheckCircle2 aria-label={`${label} ready`} className="h-5 w-5 shrink-0" style={{ color: "#059669" }} />
        : <Circle aria-label={`${label} pending`} className="h-5 w-5 shrink-0 text-gray-300" />}
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {!ready && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    </li>
  );
}

export function ReadinessChecklist({ score, integrated }: { score: VocationalScoreOutcome; integrated: IntegratedOutcome }) {
  const ready360 = score.status === "ready";
  // never_computed → not ready; ready → all ready; not_ready → check missing list
  const allReady = integrated.status === "ready";
  const knownNotReady = integrated.status === "not_ready";
  const pcaReady = allReady || (knownNotReady && !integrated.missing.includes("pca"));
  const milReady = allReady || (knownNotReady && !integrated.missing.includes("mil"));
  return (
    <div className={CARD}>
      <p className="text-sm font-semibold text-gray-900 mb-3">Assessment readiness</p>
      <ul className="space-y-3">
        <Row label="360 Evaluation" ready={ready360} hint="Needs the student plus at least one other evaluator (parent, teacher, or peer)." />
        <Row label="PCA (Professional Competencies)" ready={pcaReady} hint="Complete the PCA assessment." />
        <Row label="MIL (Cognitive)" ready={milReady} hint="Complete the MIL cognitive exams." />
      </ul>
    </div>
  );
}

export default ReadinessChecklist;
