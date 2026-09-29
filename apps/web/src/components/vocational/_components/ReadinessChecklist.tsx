import { CheckCircle2, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { VocationalScoreOutcome, IntegratedOutcome } from "@/services/vocationalReportService";

const CARD = "bg-white rounded-xl shadow-sm border border-gray-100 p-5";

function Row({ label, ready, hint }: { label: string; ready: boolean; hint: string }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-start gap-3">
      {ready
        ? <CheckCircle2 aria-label={t("evaluation.vocational.report.rowReady", { label })} className="h-5 w-5 shrink-0" style={{ color: "#059669" }} />
        : <Circle aria-label={t("evaluation.vocational.report.rowPending", { label })} className="h-5 w-5 shrink-0 text-gray-300" />}
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {!ready && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
    </li>
  );
}

export function ReadinessChecklist({ score, integrated }: { score: VocationalScoreOutcome; integrated: IntegratedOutcome }) {
  const { t } = useTranslation();
  const ready360 = score.status === "ready";
  // never_computed → not ready; ready → all ready; not_ready → check missing list
  const allReady = integrated.status === "ready";
  const knownNotReady = integrated.status === "not_ready";
  const pcaReady = allReady || (knownNotReady && !integrated.missing.includes("pca"));
  const milReady = allReady || (knownNotReady && !integrated.missing.includes("mil"));
  return (
    <div className={CARD}>
      <p className="text-sm font-semibold text-gray-900 mb-3">{t("evaluation.vocational.report.readinessTitle")}</p>
      <ul className="space-y-3">
        <Row label={t("evaluation.vocational.report.row360")} ready={ready360} hint={t("evaluation.vocational.report.row360Hint")} />
        <Row label={t("evaluation.vocational.report.rowPca")} ready={pcaReady} hint={t("evaluation.vocational.report.rowPcaHint")} />
        <Row label="MIL" ready={milReady} hint={t("evaluation.vocational.report.rowMilHint")} />
      </ul>
    </div>
  );
}

export default ReadinessChecklist;
