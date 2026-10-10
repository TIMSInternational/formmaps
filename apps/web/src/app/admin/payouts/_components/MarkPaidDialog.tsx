"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface MarkPaidTarget {
  payoutId: string;
  coach: string;
  amount: string;
}

/** Today as YYYY-MM-DD in the admin's own zone — the default "date paid". */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * "Mark as paid" (audit D3). FormMaps sends no money, so the admin confirms they paid the coach themselves and
 * records the day and an optional reference. In-page dialog (no window.confirm).
 */
export function MarkPaidDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: MarkPaidTarget | null;
  onClose: () => void;
  onConfirm: (details: { paidAt: string; reference: string }) => Promise<void>;
}) {
  const { t: tPO } = useTranslation("platform_owner");
  const [paidAt, setPaidAt] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      setPaidAt(todayIso());
      setReference("");
    }
  }, [target]);

  const submit = async () => {
    if (!target || !paidAt) return;
    setSaving(true);
    try {
      await onConfirm({ paidAt, reference });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md" data-testid="mark-paid-dialog">
        <DialogHeader>
          <DialogTitle>{tPO("payouts.markPaid.confirmTitle")}</DialogTitle>
          <DialogDescription>
            {target ? tPO("payouts.markPaid.dialogDesc", { coach: target.coach, amount: target.amount }) : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="mark-paid-date">{tPO("payouts.markPaid.paidAtLabel")}</Label>
            <Input id="mark-paid-date" type="date" value={paidAt} max={todayIso()} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mark-paid-reference">{tPO("payouts.markPaid.referenceLabel")}</Label>
            <Input
              id="mark-paid-reference"
              value={reference}
              maxLength={200}
              placeholder={tPO("payouts.markPaid.referencePlaceholder")}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {tPO("payouts.markPaid.cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !paidAt}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tPO("payouts.markPaid.confirmLabel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
