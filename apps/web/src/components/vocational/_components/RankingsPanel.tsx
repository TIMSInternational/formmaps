import { useTranslation } from "react-i18next";
import type { Rankings } from "@/services/vocationalReportService";

const CARD = "bg-white rounded-xl shadow-sm border border-gray-100 p-5";

export function RankingsPanel({ rankings, labels = {} }: { rankings: Rankings; labels?: Record<string, string> }) {
  const { t } = useTranslation();
  // Rankings hold option values (slugs); show the evaluator-facing label when we have it.
  const label = (value: string) => labels[value] ?? value;
  return (
    <div className={CARD}>
      <p className="text-sm font-semibold text-gray-900 mb-4">{t("evaluation.vocational.report.interestsTitle")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{t("evaluation.vocational.report.topInterests")}</p>
          <ol className="space-y-1 list-decimal list-inside">
            {rankings.interests.slice(0, 10).map((i) => (
              <li key={i.value} className="text-sm text-gray-700">{label(i.value)}</li>
            ))}
            {rankings.interests.length === 0 && <li className="text-sm text-gray-400 list-none">{t("evaluation.vocational.report.noData")}</li>}
          </ol>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{t("evaluation.vocational.report.topIndustries")}</p>
          <ul className="space-y-1">
            {rankings.industries.slice(0, 10).map((i) => (
              <li key={i.value} className="text-sm text-gray-700">{label(i.value)}</li>
            ))}
            {rankings.industries.length === 0 && <li className="text-sm text-gray-400">{t("evaluation.vocational.report.noData")}</li>}
          </ul>
          {rankings.workType && (
            <p className="text-sm text-gray-700 mt-3"><span className="font-medium">{t("evaluation.vocational.report.workType")}</span> {label(rankings.workType.value)}</p>
          )}
        </div>
      </div>
      {rankings.openInsights.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{t("evaluation.vocational.report.inTheirWords")}</p>
          <ul className="space-y-2">
            {rankings.openInsights.map((o, idx) => (
              <li key={idx} className="text-sm text-gray-600 border-l-2 pl-3" style={{ borderColor: "var(--admin-accent-blue)" }}>
                <span className="text-gray-400 text-xs mr-2">{t(`evaluation.vocational.report.groups.${o.group}`, { defaultValue: o.group })}:</span>{o.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default RankingsPanel;
