import { useTranslation } from "react-i18next";
import type { IntegratedOutcome } from "@/services/vocationalReportService";

const CARD = "bg-white rounded-xl shadow-sm border border-gray-100 p-5";

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-600"><span>{label}</span><span>{Math.round(value)}</span></div>
      <div className="h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: "#102B47" }} />
      </div>
    </div>
  );
}

export function IntegratedHeadline({ integrated }: { integrated: IntegratedOutcome }) {
  const { t } = useTranslation();
  if (integrated.status !== "ready") {
    return (
      <div className={CARD}>
        <p className="text-sm font-medium text-gray-700">{t("evaluation.vocational.report.integratedTitle")}</p>
        <p className="text-sm text-gray-500 mt-1">{t("evaluation.vocational.report.integratedLocked")}</p>
      </div>
    );
  }
  return (
    <div className={CARD}>
      <p className="text-sm font-medium text-gray-700">{t("evaluation.vocational.report.integratedTitle")}</p>
      <div className="flex items-baseline gap-3 mt-1">
        <span className="text-4xl font-bold" style={{ color: "var(--admin-accent-blue)" }}>{integrated.integratedComposite.toFixed(1)}</span>
        <span className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t(`evaluation.vocational.report.bands.${integrated.band}`, { defaultValue: integrated.band })}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        <Bar label={`360 (${Math.round(integrated.weightsApplied.threeSixty * 100)}%)`} value={integrated.threeSixtyScore} />
        <Bar label={`PCA (${Math.round(integrated.weightsApplied.pca * 100)}%)`} value={integrated.pcaScore} />
        <Bar label={`MIL (${Math.round(integrated.weightsApplied.mil * 100)}%)`} value={integrated.milScore} />
      </div>
    </div>
  );
}

export default IntegratedHeadline;
