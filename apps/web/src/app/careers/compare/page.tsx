"use client";

import React from "react";
import { useCareersStore } from "@/store/useCareersStore";
import { useCareerList } from "@/hooks/useCareerQueries";
import { useTimsCareerScoring } from "@/hooks/useTimsQueries";
import { useTranslation } from "react-i18next";

export default function ComparePage() {
  const { t } = useTranslation();
  const { compareList } = useCareersStore();
  const { data: careersData } = useCareerList();
  const { data: timsData } = useTimsCareerScoring();

  const selected = React.useMemo(() => {
    const timsCareers = timsData?.data?.careers || [];
    const staticCareers = careersData?.careers || [];

    return compareList
      .map((id) => {
        const timsMatch = timsCareers.find(
          (c) => c.programId === id || c.programId === id
        );
        const staticMatch = staticCareers.find(
          (c) => c.id === id || c.slug === id
        );

        if (staticMatch) {
          return {
            ...staticMatch,
            matchScore: timsMatch?.totalScore ?? staticMatch.matchScore,
          };
        }

        if (timsMatch) {
          return {
            id: timsMatch.programId,
            title: { en: timsMatch.programTitle, es: timsMatch.programTitle },
            matchScore: timsMatch.totalScore,
            educationLevel: "--",
            salaryRange: undefined,
            skills: [],
          };
        }

        return null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  }, [compareList, careersData, timsData]);

  const rows = [
    {
      label: t("career.compare.table.match"),
      render: (c: typeof selected[0]) => (
        <span className="font-bold text-indigo-600">
          {c.matchScore ? `${c.matchScore}%` : "--"}
        </span>
      ),
      hasData: (c: typeof selected[0]) => c.matchScore !== undefined,
    },
    {
      label: t("career.compare.table.education"),
      render: (c: typeof selected[0]) => c.educationLevel || "--",
      hasData: (c: typeof selected[0]) => !!c.educationLevel && c.educationLevel !== "--",
    },
    {
      label: t("career.compare.table.salary"),
      render: (c: typeof selected[0]) =>
        c.salaryRange?.median
          ? `$${(c.salaryRange.median / 1000).toFixed(0)}k`
          : "--",
      hasData: (c: typeof selected[0]) => !!c.salaryRange?.median,
    },
    {
      label: t("career.compare.table.skills"),
      render: (c: typeof selected[0]) =>
        (c.skills || []).map((sk: any) => sk.name.en).join(", ") || "--",
      hasData: (c: typeof selected[0]) => !!c.skills && c.skills.length > 0,
    },
  ];

  const visibleRows = rows.filter((row) =>
    selected.some((c) => row.hasData(c))
  );

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-bold">{t("career.compare.title")}</h2>
        <p className="text-sm text-gray-500 mt-2">
          {t("career.compare.description")}
        </p>
        <div className="mt-6">
          {selected.length === 0 && (
            <div className="text-sm text-gray-500">
              {t("career.compare.noSelected")}
            </div>
          )}
          {selected.length > 0 && (
            <div className="overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="p-2">
                      {t("career.compare.table.attribute")}
                    </th>
                    {selected.map((s) => (
                      <th key={s.id} className="p-2 min-w-[150px]">
                        {s.title.en}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-semibold bg-gray-50">
                        {row.label}
                      </td>
                      {selected.map((s) => (
                        <td key={s.id} className="p-2">
                          {row.render(s)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
