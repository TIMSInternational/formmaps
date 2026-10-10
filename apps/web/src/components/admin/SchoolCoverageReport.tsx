"use client";

// audit 2026-10-09 E4 — Super Admin coverage report on the admin Schools page. Which schools cover
// their students under the student paywall, and how many students keep access via their own
// subscription. Data: GET /api/v1/admin/coverage (paged server-side).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getCoverageReport, type CoverageReportResponse } from "@/services/schoolService";

const LIMIT = 25;

// Contract dates are plain dates stored as midnight UTC — show the date part, never shifted by the viewer's zone.
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "-");

export function SchoolCoverageReport() {
  const { t } = useTranslation();
  const { t: tPO } = useTranslation("platform_owner");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<CoverageReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFailed(false);
    getCoverageReport({ page, limit: LIMIT })
      .then((r) => { if (!cancelled) setReport(r); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  const rows = report?.data ?? [];
  const totalPages = report?.totalPages || 1;

  return (
    <section aria-labelledby="coverage-title" className="mt-8">
      <div className="mb-3">
        <h2 id="coverage-title" className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {tPO("schools.coverage.title")}
        </h2>
        <p className="text-sm text-gray-500 mt-1">{tPO("schools.coverage.description")}</p>
        {report && (
          <p className="text-xs mt-1 font-medium" data-testid="coverage-paywall">
            {report.paywallEnabled ? tPO("schools.coverage.paywallOn") : tPO("schools.coverage.paywallOff")}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              <TableHead>{tPO("schools.coverage.table.school")}</TableHead>
              <TableHead>{tPO("schools.coverage.table.status")}</TableHead>
              <TableHead>{tPO("schools.coverage.table.contract")}</TableHead>
              <TableHead>{tPO("schools.coverage.table.covered")}</TableHead>
              <TableHead className="text-right">{tPO("schools.coverage.table.students")}</TableHead>
              <TableHead className="text-right">{tPO("schools.coverage.table.bySchool")}</TableHead>
              <TableHead className="text-right">{tPO("schools.coverage.table.bySubscription")}</TableHead>
              <TableHead className="text-right">{tPO("schools.coverage.table.byComplimentary")}</TableHead>
              <TableHead className="text-right">{tPO("schools.coverage.table.notCovered")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-20 text-center text-gray-500">
                  {tPO("schools.coverage.loading")}
                </TableCell>
              </TableRow>
            ) : failed ? (
              <TableRow>
                <TableCell colSpan={9} className="h-20 text-center text-red-600" role="alert">
                  {tPO("schools.coverage.error")}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-20 text-center text-gray-500">
                  {tPO("schools.coverage.empty")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} data-testid={`coverage-row-${row.id}`}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="capitalize">{row.status}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {day(row.contractStartDate)} → {day(row.contractEndDate)}
                    <div className="text-xs text-gray-400">{row.timezone}</div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        row.covered ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700",
                      )}
                    >
                      {row.covered ? tPO("schools.coverage.yes") : tPO("schools.coverage.no")}
                    </span>
                    <div className="text-xs text-gray-500 mt-0.5">{tPO(`schools.coverage.reasons.${row.reason}`)}</div>
                    {row.complimentaryUntil && (
                      <div className="text-xs text-green-700 mt-0.5">
                        {tPO("complimentary.until", { date: new Date(row.complimentaryUntil).toLocaleDateString() })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{row.students}</TableCell>
                  <TableCell className="text-right">{row.coveredBySchool}</TableCell>
                  <TableCell className="text-right">{row.coveredBySubscription}</TableCell>
                  <TableCell className="text-right">{row.coveredByComplimentary ?? 0}</TableCell>
                  <TableCell className={cn("text-right", row.notCovered > 0 && "text-amber-700 font-medium")}>
                    {row.notCovered}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end space-x-2 p-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || isLoading}
        >
          {t("common.previous", "Previous")}
        </Button>
        <div className="text-sm text-gray-500">
          {tPO("schools.pagination.pageOf", { page, total: totalPages })}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= totalPages || isLoading}
        >
          {t("common.next", "Next")}
        </Button>
      </div>
    </section>
  );
}
