"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DynamicBookingModal } from "@/lib/dynamic-imports";
import { useTranslation } from "react-i18next";
import type { Coach } from "@/types/coach";
import type { Session } from "./coaching-sessions-list";
import type { CounselorSession } from "@/services/counselorSessionService";

// ── Cancel Coaching Session Dialog ──────────────────────────────────────────

interface CancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session | null;
  cancelReason: string;
  onCancelReasonChange: (reason: string) => void;
  onConfirm: () => void;
  isProcessing: boolean;
}

export function CancelSessionDialog({
  open,
  onOpenChange,
  session,
  cancelReason,
  onCancelReasonChange,
  onConfirm,
  isProcessing,
}: CancelDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{t("coach:mySessions.cancel.title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("coach:mySessions.cancel.description", { name: session?.coachName })}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="text-sm font-medium text-foreground mb-2 block">
            {t("coach:mySessions.cancel.reasonLabel")}
          </label>
          <Textarea
            placeholder={t("coach:mySessions.cancel.reasonPlaceholder")}
            value={cancelReason}
            onChange={(e) => onCancelReasonChange(e.target.value)}
            rows={3}
            className="resize-none rounded-xl border-border"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">
            {t("coach:mySessions.cancel.keepSession")}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isProcessing} className="rounded-lg">
            {isProcessing ? t("coach:mySessions.cancel.cancelling") : t("coach:mySessions.cancel.confirmCancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Review Dialog ───────────────────────────────────────────────────────────

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session | null;
  rating: number;
  onRatingChange: (rating: number) => void;
  comment: string;
  onCommentChange: (comment: string) => void;
  onConfirm: () => void;
  isProcessing: boolean;
}

export function ReviewSessionDialog({
  open,
  onOpenChange,
  session,
  rating,
  onRatingChange,
  comment,
  onCommentChange,
  onConfirm,
  isProcessing,
}: ReviewDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{t("coach:mySessions.review.title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("coach:mySessions.review.description", { name: session?.coachName })}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-6">
          <div className="flex justify-center gap-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => onRatingChange(star)}
                className="focus:outline-none transition-all hover:scale-110 active:scale-95"
              >
                <Star
                  className={`h-10 w-10 ${
                    star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                  }`}
                />
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">{t("coach:mySessions.review.commentLabel")}</Label>
            <Textarea
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder={t("coach:mySessions.review.commentPlaceholder")}
              rows={4}
              className="resize-none rounded-xl border-border"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">
            {t("coach:mySessions.review.cancel")}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isProcessing}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-lg"
          >
            {isProcessing ? t("coach:mySessions.review.submitting") : t("coach:mySessions.review.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Cancel Counselor Session Dialog ─────────────────────────────────────────

interface CancelCounselorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: CounselorSession | null;
  reason: string;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
}

export function CancelCounselorDialog({
  open,
  onOpenChange,
  session,
  reason,
  onReasonChange,
  onConfirm,
}: CancelCounselorDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{t("coach:mySessions.cancelCounselor.title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("coach:mySessions.cancelCounselor.description", { name: session?.counselorName })}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="text-sm font-medium text-foreground mb-2 block">
            {t("coach:mySessions.cancelCounselor.reasonLabel")}
          </label>
          <Textarea
            placeholder={t("coach:mySessions.cancelCounselor.reasonPlaceholder")}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={3}
            className="resize-none rounded-xl border-border"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">
            {t("coach:mySessions.cancelCounselor.keep")}
          </Button>
          <Button variant="destructive" onClick={onConfirm} className="rounded-lg">
            {t("coach:mySessions.cancelCounselor.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reschedule Booking Modal ────────────────────────────────────────────────

interface RescheduleModalProps {
  coach: Coach | null;
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  onSuccess: () => void;
}

export function RescheduleBookingModal({
  coach,
  isOpen,
  onClose,
  session,
  onSuccess,
}: RescheduleModalProps) {
  return (
    <DynamicBookingModal
      coach={coach}
      isOpen={isOpen}
      onClose={onClose}
      mode="reschedule"
      bookingId={session?.id}
      initialTopic={session?.topic || ""}
      initialNotes={session?.notes || ""}
      onRescheduleSuccess={onSuccess}
    />
  );
}
