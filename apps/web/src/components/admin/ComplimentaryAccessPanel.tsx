"use client";

// audit 2026-10-09 E5 (decision D6) — Super Admin grants a student or a school free access for N days
// (default 30). Shows "Complimentary until <date>" with Revoke while a grant is active. Nothing is ever
// charged and it never counts as revenue (see services/complimentaryAccessService.ts).

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Gift, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  COMP_DEFAULT_DAYS,
  COMP_MAX_DAYS,
  grantComplimentaryAccess,
  listComplimentaryGrants,
  revokeComplimentaryAccess,
  type ComplimentaryGrant,
  type ComplimentaryTargetType,
} from "@/services/complimentaryAccessService";

const errorMessage = (err: unknown) => (err as { data?: { message?: string } })?.data?.message;

export function ComplimentaryAccessPanel({
  targetType,
  targetId,
  targetName,
}: {
  targetType: ComplimentaryTargetType;
  targetId: string;
  targetName: string;
}) {
  const { t } = useTranslation("platform_owner");
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [grant, setGrant] = useState<ComplimentaryGrant | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(String(COMP_DEFAULT_DAYS));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return listComplimentaryGrants(targetType, targetId)
      .then((rows) => setGrant(rows[0] ?? null))
      .catch(() => setGrant(null))
      .finally(() => setLoading(false));
  }, [targetType, targetId]);

  useEffect(() => { void load(); }, [load]);

  const n = Number(days);
  const daysValid = /^\d+$/.test(days.trim()) && n >= 1 && n <= COMP_MAX_DAYS;

  const onGrant = async () => {
    if (!daysValid) return;
    setSaving(true);
    try {
      const created = await grantComplimentaryAccess({ targetType, targetId, days: n, note: note.trim() || undefined });
      setGrant(created);
      setNote("");
      toast.success(t("complimentary.granted", { name: targetName, date: new Date(created.expiresAt).toLocaleDateString() }));
    } catch (err) {
      toast.error(errorMessage(err) || t("complimentary.grantFailed"));
    } finally {
      setSaving(false);
    }
  };

  const onRevoke = async () => {
    if (!grant) return;
    const ok = await confirm({
      title: t("complimentary.revokeTitle"),
      description: t("complimentary.revokeBody", { name: targetName }),
      confirmLabel: t("complimentary.revoke"),
      variant: "destructive",
    });
    if (!ok) return;
    setSaving(true);
    try {
      await revokeComplimentaryAccess(grant.id);
      setGrant(null);
      toast.success(t("complimentary.revoked", { name: targetName }));
    } catch (err) {
      toast.error(errorMessage(err) || t("complimentary.revokeFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-gray-100 p-4" data-testid="complimentary-access">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Gift className="h-3.5 w-3.5" /> {t("complimentary.title")}
      </p>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-label={t("complimentary.loading")} />
      ) : grant ? (
        <div className="flex items-center justify-between gap-3">
          <span
            data-testid="complimentary-badge"
            className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700"
          >
            {t("complimentary.until", { date: new Date(grant.expiresAt).toLocaleDateString() })}
          </span>
          <button
            type="button"
            onClick={onRevoke}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {t("complimentary.revoke")}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            {t(targetType === "school" ? "complimentary.helpSchool" : "complimentary.helpStudent")}
          </p>
          <div className="flex items-end gap-2">
            <label className="text-xs text-gray-600">
              {t("complimentary.days")}
              <Input
                type="number"
                min={1}
                max={COMP_MAX_DAYS}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                aria-invalid={!daysValid}
                className="mt-1 w-24"
              />
            </label>
            <label className="text-xs text-gray-600 flex-1">
              {t("complimentary.note")}
              <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="mt-1" />
            </label>
          </div>
          {!daysValid && <p className="text-xs text-red-600">{t("complimentary.daysInvalid", { max: COMP_MAX_DAYS })}</p>}
          <button
            type="button"
            onClick={onGrant}
            disabled={saving || !daysValid}
            className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {saving ? t("complimentary.saving") : t("complimentary.grant")}
          </button>
        </div>
      )}
      <ConfirmDialog />
    </div>
  );
}
