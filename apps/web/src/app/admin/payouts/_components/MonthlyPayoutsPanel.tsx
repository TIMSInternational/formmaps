"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CalendarRange, CheckCircle, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/utils";
import {
  approveAdminPayout,
  generateMonthlyPayouts,
  getMonthlyPayouts,
  previousMonth,
  type MonthlyPayoutRow,
} from "@/services/adminPayoutService";
import { MarkPaidDialog, type MarkPaidTarget } from "./MarkPaidDialog";

const money = (cents: number, currency: string) => formatCurrency(cents / 100, currency || "USD");

/** "2026-09" → "September 2026" in the UI language (the month itself, never shifted by the viewer's zone). */
function monthLabel(month: string, language: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

const statusClass = (status: string) =>
  status === "completed"
    ? "bg-emerald-50 text-emerald-700"
    : status === "failed" || status === "rejected"
      ? "bg-red-50 text-red-700"
      : "bg-amber-50 text-amber-700";

/**
 * Audit D3 — manual monthly coach payouts: pick a month, see what each coach earned (completed + paid sessions,
 * minus refunds and commission), generate the pending payouts once the month has ended, and mark each one paid.
 */
export function MonthlyPayoutsPanel({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation();
  const { t: tPO, i18n } = useTranslation("platform_owner");
  const [month, setMonth] = useState(previousMonth());
  const [generating, setGenerating] = useState(false);
  const [markPaid, setMarkPaid] = useState<MarkPaidTarget | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["adminMonthlyPayouts", month],
    queryFn: () => getMonthlyPayouts(month),
    enabled: /^\d{4}-\d{2}$/.test(month),
  });

  const label = monthLabel(month, i18n.language || "en");
  const rows = data?.rows ?? [];
  const currency = rows[0]?.currency || "USD";
  const singleCurrency = rows.every((r) => r.currency === currency);

  const handleGenerate = async () => {
    const ok = await confirm({
      title: tPO("payouts.monthly.confirmTitle", { month: label }),
      description: tPO("payouts.monthly.confirmDesc", { month: label }),
      confirmLabel: tPO("payouts.monthly.confirmLabel"),
    });
    if (!ok) return;
    setGenerating(true);
    try {
      const r = await generateMonthlyPayouts(month);
      toast.success(tPO("payouts.monthly.generated", { month: label, created: r.created, updated: r.updated, unchanged: r.unchanged }));
      await refetch();
      onChanged?.();
    } catch (error: any) {
      toast.error(error?.message || tPO("payouts.monthly.generateFailed"));
    } finally {
      setGenerating(false);
    }
  };

  const openMarkPaid = (row: MonthlyPayoutRow) => {
    if (!row.payout) return;
    setMarkPaid({ payoutId: row.payout.id, coach: row.coachName || row.coachEmail, amount: money(row.payout.netCents, row.currency) });
  };

  const handleMarkPaid = async (details: { paidAt: string; reference: string }) => {
    if (!markPaid) return;
    try {
      await approveAdminPayout(markPaid.payoutId, details);
      toast.success(tPO("payouts.markPaid.success"));
      setMarkPaid(null);
      await refetch();
      onChanged?.();
    } catch (error: any) {
      toast.error(error?.message || t("pages.admin.payouts.approveFailed"));
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="monthly-payouts">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 p-6 border-b border-gray-100">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-gray-400" />
            {tPO("payouts.monthly.title")}
          </h2>
          <p className="text-sm text-gray-500 max-w-2xl">{tPO("payouts.monthly.subtitle")}</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
            {tPO("payouts.monthly.monthLabel")}
            <Input
              type="month"
              aria-label={tPO("payouts.monthly.monthLabel")}
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="h-10 w-44 bg-white"
            />
          </label>
          <Button onClick={handleGenerate} disabled={generating || isLoading || !data?.monthEnded || rows.length === 0} className="h-10">
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {generating ? tPO("payouts.monthly.generating") : tPO("payouts.monthly.generate")}
          </Button>
        </div>
      </div>
      {data && !data.monthEnded && (
        <p className="px-6 pt-4 text-sm text-amber-700">{tPO("payouts.monthly.notEnded")}</p>
      )}
      {isError && <p className="px-6 pt-4 text-sm text-red-600">{tPO("payouts.monthly.loadFailed")}</p>}

      <Table>
        <TableHeader className="bg-gray-50/50">
          <TableRow>
            <TableHead className="pl-6">{tPO("payouts.monthly.table.coach")}</TableHead>
            <TableHead className="text-right">{tPO("payouts.monthly.table.sessions")}</TableHead>
            <TableHead className="text-right">{tPO("payouts.monthly.table.gross")}</TableHead>
            <TableHead className="text-right">{tPO("payouts.monthly.table.commission")}</TableHead>
            <TableHead className="text-right">{tPO("payouts.monthly.table.net")}</TableHead>
            <TableHead>{tPO("payouts.monthly.table.status")}</TableHead>
            <TableHead className="text-right pr-6">{tPO("payouts.monthly.table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRowsSkeleton columnCount={7} rowCount={3} />
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-gray-500">{tPO("payouts.monthly.empty")}</TableCell>
            </TableRow>
          ) : (
            <>
              {rows.map((row) => (
                <TableRow key={`${row.coachId}-${row.currency}`} data-testid="monthly-payout-row">
                  <TableCell className="pl-6">
                    <div className="flex flex-col">
                      <span className="font-semibold text-gray-900">{row.coachName}</span>
                      <span className="text-xs text-gray-400">{row.coachEmail}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{row.sessions}</TableCell>
                  <TableCell className="text-right">{money(row.grossCents, row.currency)}</TableCell>
                  <TableCell className="text-right text-gray-500">
                    {money(row.commissionCents, row.currency)} <span className="text-xs">({row.commissionPercent}%)</span>
                  </TableCell>
                  <TableCell className="text-right font-bold text-gray-900" data-testid="monthly-payout-net">
                    {money(row.netCents, row.currency)}
                  </TableCell>
                  <TableCell>
                    {row.payout ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={`w-fit border-0 shadow-none ${statusClass(row.payout.status)}`}>
                          {tPO(`payouts.status.${row.payout.status}`, { defaultValue: row.payout.status })}
                        </Badge>
                        {row.payout.paidAt && (
                          <span className="text-xs text-gray-500">
                            {tPO("payouts.monthly.paidOn", { date: new Date(row.payout.paidAt).toLocaleDateString(i18n.language || "en", { timeZone: "UTC" }) })}
                            {row.payout.reference ? ` · ${row.payout.reference}` : ""}
                          </span>
                        )}
                        {row.differenceCents !== 0 && (
                          <span className="flex items-center gap-1 text-xs text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            {tPO("payouts.monthly.difference", { amount: money(row.differenceCents, row.currency) })}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">{tPO("payouts.monthly.notGenerated")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    {row.payout?.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => openMarkPaid(row)} className="gap-1">
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        {tPO("payouts.markPaid.action")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {singleCurrency && data && (
                <TableRow className="bg-gray-50/50 font-semibold">
                  <TableCell className="pl-6">{tPO("payouts.monthly.total")}</TableCell>
                  <TableCell className="text-right">{data.totals.sessions}</TableCell>
                  <TableCell className="text-right">{money(data.totals.grossCents, currency)}</TableCell>
                  <TableCell className="text-right">{money(data.totals.commissionCents, currency)}</TableCell>
                  <TableCell className="text-right">{money(data.totals.netCents, currency)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>

      <MarkPaidDialog target={markPaid} onClose={() => setMarkPaid(null)} onConfirm={handleMarkPaid} />
      <ConfirmDialog />
    </section>
  );
}
