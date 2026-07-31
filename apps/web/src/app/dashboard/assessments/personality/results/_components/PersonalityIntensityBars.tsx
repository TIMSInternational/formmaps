"use client";

/**
 * Per-dimension intensity bars — winning pole letter + normalizedIntensity,
 * with a "balanced" note for dimensions where the two poles tied.
 */
import { useTranslation } from "react-i18next";
import type { DimensionScore } from "@/services/personalityService";

export function PersonalityIntensityBars({ dimensions }: { dimensions: DimensionScore[] }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {dimensions.map((d) => (
        <div key={d.dimension}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#065292] text-white text-sm font-bold">
                {d.winningPole}
              </span>
              <span className="text-sm font-semibold text-foreground">{d.dimension}</span>
              {d.balanced && (
                <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                  {t("personality.balanced")}
                </span>
              )}
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">{d.normalizedIntensity}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-[#065292] h-full rounded-full transition-[width] duration-500"
              style={{ width: `${d.normalizedIntensity}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
