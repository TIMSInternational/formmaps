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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Cancel Session</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Are you sure you want to cancel this session with{" "}
            <span className="font-medium text-foreground">{session?.coachName}</span>?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="text-sm font-medium text-foreground mb-2 block">
            Reason for cancellation
          </label>
          <Textarea
            placeholder="Please let us know why you're cancelling..."
            value={cancelReason}
            onChange={(e) => onCancelReasonChange(e.target.value)}
            rows={3}
            className="resize-none rounded-xl border-border"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">
            Keep Session
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isProcessing} className="rounded-lg">
            {isProcessing ? "Cancelling..." : "Cancel Session"}
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Leave a Review</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            How was your session with{" "}
            <span className="font-medium text-foreground">{session?.coachName}</span>?
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
            <Label className="text-sm font-medium text-foreground">Comment</Label>
            <Textarea
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="Share your experience..."
              rows={4}
              className="resize-none rounded-xl border-border"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isProcessing}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-lg"
          >
            {isProcessing ? "Submitting..." : "Submit Review"}
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Cancel Counselor Session</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Are you sure you want to cancel your session with{" "}
            <span className="font-medium text-foreground">{session?.counselorName}</span>?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="text-sm font-medium text-foreground mb-2 block">
            Reason for cancellation
          </label>
          <Textarea
            placeholder="Please let your counselor know why you&apos;re cancelling..."
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={3}
            className="resize-none rounded-xl border-border"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-lg">
            Keep Session
          </Button>
          <Button variant="destructive" onClick={onConfirm} className="rounded-lg">
            Cancel Session
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
