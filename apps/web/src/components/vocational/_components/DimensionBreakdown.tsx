"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DimensionScore } from "@/services/vocationalReportService";

const CARD = "bg-white rounded-xl shadow-sm border border-gray-100 p-5";

function bar(value: number) {
  return (
    <div className="h-2 rounded-full bg-gray-100 flex-1">
      <div className="h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: "#102B47" }} />
    </div>
  );
}

export function DimensionBreakdown({ dimensions }: { dimensions: DimensionScore[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className={CARD}>
      <p className="text-sm font-semibold text-gray-900 mb-4">{t("evaluation.vocational.report.dimensions")}</p>
      <ul className="space-y-3">
        {dimensions.map((d) => {
          const expanded = open === d.key;
          const groups = Object.entries(d.byGroup);
          return (
            <li key={d.key} className="border-b border-gray-50 pb-3 last:border-0">
              <button type="button" onClick={() => setOpen(expanded ? null : d.key)}
                className="w-full flex items-center gap-3 text-left">
                {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                <span className="text-sm font-medium text-gray-800 w-56 shrink-0">{d.nameEs}</span>
                {d.score === null
                  ? <span className="text-xs text-gray-400">{t("evaluation.vocational.report.noResponses")}</span>
                  : (<>{bar(d.score)}<span className="text-xs font-semibold text-gray-700 w-16 text-right">{Math.round(d.score)} · {d.band ? t(`evaluation.vocational.report.bands.${d.band}`, { defaultValue: d.band }) : ""}</span></>)}
              </button>
              {expanded && groups.length > 0 && (
                <div className="mt-2 ml-7 space-y-1">
                  {groups.map(([g, v]) => (
                    <div key={g} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20">{t(`evaluation.vocational.report.groups.${g}`, { defaultValue: g })}</span>
                      {bar(v)}
                      <span className="text-xs text-gray-500 w-8 text-right">{Math.round(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default DimensionBreakdown;
