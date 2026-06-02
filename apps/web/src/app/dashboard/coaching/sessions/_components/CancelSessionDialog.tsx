"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { FormattedSession } from "./session-types";

interface CancelSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: FormattedSession | null;
  onSessionCancelled: (sessionId: string) => void;
}

export function CancelSessionDialog({
  open,
  onOpenChange,
  session,
  onSessionCancelled,
}: CancelSessionDialogProps) {
  const { t } = useTranslation();

  const handleCancel = async () => {
    try {
      if (!session) return;

      // Optimistic update via callback
      onSessionCancelled(session.id);
      toast.success(t("coaching.dashboard.sessionCancelled"));
      onOpenChange(false);

      // API call
      const { cancelSession } = await import("@/services/coachService");
      await cancelSession(session.id, "Cancelled by coach");
    } catch {
      toast.error(t("coaching.dashboard.cancelFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="p-8 text-center flex flex-col items-center">
          <div className="h-16 w-16 bg-red-50 rounded-full flex items-center justify-center mb-6 animate-bounce-slow">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-2">
            Cancel Session?
          </h3>
          <p className="text-muted-foreground text-center mb-8 leading-relaxed">
            Are you sure you want to cancel the session with{" "}
            <span className="font-semibold text-foreground">
              {session?.studentName}
            </span>
            ? This action cannot be undone.
          </p>

          <div className="flex flex-col gap-3 w-full">
            <Button variant="destructive" className="w-full" onClick={handleCancel}>
              Yes, Cancel Session
            </Button>
            <Button
              variant="ghost"
              className="w-full h-12 rounded-xl text-muted-foreground font-semibold hover:bg-gray-100"
              onClick={() => onOpenChange(false)}
            >
              Keep Session
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
