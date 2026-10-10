"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Lock, CheckCircle2, Clock, Circle } from "lucide-react";
import { toast } from "sonner";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { isPaymentRequiredError } from "@/lib/api/apiClient";
import { getChildReportBlob } from "@/services/parentPortalService";
import type { ChildResults } from "@/types/parentPortal";

interface ChildResultsTabProps {
  studentId: string;
  lang: "es" | "en";
  results: ChildResults | undefined;
  isLoading: boolean;
  error: unknown;
}

const STATUS_STYLE = {
  completed: { icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700" },
  in_progress: { icon: Clock, className: "bg-amber-100 text-amber-700" },
  not_started: { icon: Circle, className: "bg-slate-100 text-slate-600" },
} as const;

// Audit 2026-10-09 E1: the child's results as a parent sees them — status, date and score summary per
// assessment, plus the career report PDF. Answers are never sent to a parent, so there is nothing to hide here.
export function ChildResultsTab({ studentId, lang, results, isLoading, error }: ChildResultsTabProps) {
  const { t, i18n } = useTranslation("parent");
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await getChildReportBlob(studentId, lang);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `career-report-${lang}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("results.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <TabsContent value="results" className="mt-4">
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : isPaymentRequiredError(error) ? (
        <div className="dash-card p-8 text-center space-y-2" data-testid="child-results-locked">
          <Lock className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="font-medium text-foreground">{t("results.lockedTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("results.lockedBody")}</p>
        </div>
      ) : !results ? (
        <div className="dash-card p-8 text-center text-muted-foreground">{t("results.unavailable")}</div>
      ) : (
        <div className="space-y-4" data-testid="child-results">
          <div className="dash-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">{t("results.reportTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {results.report.available ? t("results.reportReady") : t("results.reportNotReady")}
              </p>
            </div>
            <Button onClick={download} disabled={!results.report.available || downloading}>
              <Download className="mr-2 h-4 w-4" />
              {downloading ? t("results.downloading") : t("results.download")}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.assessments.map((a) => {
              const style = STATUS_STYLE[a.status] ?? STATUS_STYLE.not_started;
              const Icon = style.icon;
              return (
                <div key={a.key} className="dash-card p-4 space-y-3" data-testid={`child-result-${a.key}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground">{a.title}</p>
                    <Badge variant="secondary" className={style.className}>
                      <Icon className="mr-1 h-3 w-3" />
                      {t(`results.status.${a.status}`)}
                    </Badge>
                  </div>
                  {a.completedAt && (
                    <p className="text-xs text-muted-foreground">
                      {t("results.completedOn", { date: new Date(a.completedAt).toLocaleDateString(i18n.language) })}
                    </p>
                  )}
                  {a.summary.length > 0 && (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      {a.summary.map((s) => (
                        <div key={s.label} className="contents">
                          <dt className="text-muted-foreground">{s.label}</dt>
                          <dd className="font-medium text-foreground text-right">{s.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </TabsContent>
  );
}
