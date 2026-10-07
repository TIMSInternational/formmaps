"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Check, Search, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssessmentAnswers } from "@/hooks/useStudentRecord";
import type { AnswerRow, RecordLang, StudentRecordAssessmentKey } from "@/services/studentRecordService";

const cellStyle: React.CSSProperties = {
  padding: "8px 10px", fontSize: 12, color: "var(--admin-font-primary)",
  verticalAlign: "top", borderBottom: "1px solid var(--admin-border-default)",
};
const headStyle: React.CSSProperties = {
  padding: "6px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
  color: "var(--admin-font-tertiary)", textAlign: "left", borderBottom: "1px solid var(--admin-border-default)",
  background: "var(--admin-bg-hover)",
};

function matches(row: AnswerRow, q: string) {
  if (!q) return true;
  const hay = [row.question, row.answer, row.correctAnswer, row.comment, row.meta, ...(row.options ?? [])]
    .filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

export function RecordAnswers({ studentId, assessmentKey, lang }: {
  studentId: string; assessmentKey: StudentRecordAssessmentKey; lang: RecordLang;
}) {
  const { t } = useTranslation("school_admin");
  const { data, isLoading, isError } = useAssessmentAnswers(studentId, assessmentKey, lang);
  const [search, setSearch] = useState("");
  const [onlyIncorrect, setOnlyIncorrect] = useState(false);

  const sections = useMemo(() => data?.sections ?? [], [data]);
  const hasCorrectness = sections.some((s) => s.rows.some((r) => r.isCorrect != null));
  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => sections
      .map((s) => ({ ...s, rows: s.rows.filter((r) => matches(r, q) && (!onlyIncorrect || r.isCorrect === false)) }))
      .filter((s) => s.rows.length > 0),
    [sections, q, onlyIncorrect],
  );

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label={t("studentRecord.answers.loading")}>
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6 w-full" style={{ background: "var(--admin-bg-hover)" }} />)}
      </div>
    );
  }
  if (isError) {
    return (
      <div role="alert" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ef4444" }}>
        <AlertCircle style={{ width: 14, height: 14 }} /> {t("studentRecord.answers.error")}
      </div>
    );
  }
  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);
  if (totalRows === 0) {
    return <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("studentRecord.answers.empty")}</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 360 }}>
          <Search style={{ position: "absolute", left: 8, top: 8, width: 14, height: 14, color: "var(--admin-font-tertiary)" }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("studentRecord.answers.searchPlaceholder")}
            aria-label={t("studentRecord.answers.searchLabel")}
            style={{
              width: "100%", height: 30, borderRadius: 6, padding: "0 10px 0 28px", fontSize: 12,
              border: "1px solid var(--admin-border-default)", background: "var(--admin-bg-card)",
              color: "var(--admin-font-primary)",
            }}
          />
        </div>
        {hasCorrectness && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--admin-font-secondary)", cursor: "pointer" }}>
            <input type="checkbox" checked={onlyIncorrect} onChange={(e) => setOnlyIncorrect(e.target.checked)} />
            {t("studentRecord.answers.onlyIncorrect")}
          </label>
        )}
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{t("studentRecord.answers.noMatches")}</p>
      ) : (
        <div style={{ maxHeight: 560, overflowY: "auto", border: "1px solid var(--admin-border-default)", borderRadius: 6 }}>
          {filtered.map((section, si) => {
            const hasCorrect = section.rows.some((r) => r.correctAnswer != null);
            const hasResult = section.rows.some((r) => r.isCorrect != null);
            const hasNotes = section.rows.some((r) => r.meta || r.comment);
            return (
              <section key={`${section.title}-${si}`} aria-label={section.title}>
                <div style={{
                  position: "sticky", top: 0, zIndex: 1, padding: "8px 12px",
                  background: "var(--admin-bg-card)", borderBottom: "1px solid var(--admin-border-default)",
                }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)", margin: 0 }}>{section.title}</h4>
                  {section.subtitle && (
                    <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{section.subtitle}</div>
                  )}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ ...headStyle, width: 40 }}>{t("studentRecord.answers.number")}</th>
                        <th style={headStyle}>{t("studentRecord.answers.question")}</th>
                        <th style={headStyle}>{t("studentRecord.answers.answer")}</th>
                        {hasCorrect && <th style={headStyle}>{t("studentRecord.answers.correctAnswer")}</th>}
                        {hasResult && <th style={{ ...headStyle, width: 70 }}>{t("studentRecord.answers.result")}</th>}
                        {hasNotes && <th style={headStyle}>{t("studentRecord.answers.notes")}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row, ri) => (
                        <tr key={`${row.n}-${ri}`} style={{ background: ri % 2 ? "var(--admin-bg-hover)" : "transparent" }}>
                          <td style={{ ...cellStyle, color: "var(--admin-font-tertiary)", fontVariantNumeric: "tabular-nums" }}>{row.n}</td>
                          <td style={cellStyle}>
                            <div>{row.question}</div>
                            {row.options && row.options.length > 0 && (
                              <ul aria-label={t("studentRecord.answers.options")} style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 11, color: "var(--admin-font-tertiary)", listStyle: "disc" }}>
                                {row.options.map((o, oi) => <li key={oi}>{o}</li>)}
                              </ul>
                            )}
                          </td>
                          <td style={{ ...cellStyle, fontWeight: 600 }}>
                            {row.answer ?? <span style={{ fontWeight: 400, color: "var(--admin-font-tertiary)", fontStyle: "italic" }}>{t("studentRecord.answers.noAnswer")}</span>}
                          </td>
                          {hasCorrect && <td style={cellStyle}>{row.correctAnswer ?? ""}</td>}
                          {hasResult && (
                            <td style={cellStyle}>
                              {row.isCorrect === true && (
                                <span title={t("studentRecord.answers.correct")} style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#10b981", fontWeight: 600 }}>
                                  <Check aria-hidden style={{ width: 14, height: 14 }} />
                                  <span className="sr-only">{t("studentRecord.answers.correct")}</span>
                                </span>
                              )}
                              {row.isCorrect === false && (
                                <span title={t("studentRecord.answers.incorrect")} style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#ef4444", fontWeight: 600 }}>
                                  <X aria-hidden style={{ width: 14, height: 14 }} />
                                  <span className="sr-only">{t("studentRecord.answers.incorrect")}</span>
                                </span>
                              )}
                            </td>
                          )}
                          {hasNotes && (
                            <td style={{ ...cellStyle, fontSize: 11, color: "var(--admin-font-secondary)" }}>
                              {[row.meta, row.comment].filter(Boolean).join(" · ")}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
