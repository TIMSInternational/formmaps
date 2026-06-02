"use client";

import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { FormattedSession } from "./session-types";

interface SessionNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: FormattedSession | null;
}

export function SessionNotesDialog({ open, onOpenChange, session }: SessionNotesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            Session Notes
          </DialogTitle>
          <DialogDescription className="ml-14 text-base">
            Private notes for your session with{" "}
            <span className="font-semibold text-foreground">
              {session?.studentName}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4">
          <div className="bg-amber-50/50 border border-amber-100 p-6 rounded-2xl text-foreground whitespace-pre-wrap leading-relaxed min-h-[150px] font-medium font-serif text-lg">
            {session?.notes || "No notes available for this session."}
          </div>
          <p className="mt-4 text-xs text-center text-muted-foreground italic">
            These notes are private and only visible to you.
          </p>
        </div>
        <DialogFooter className="p-6 pt-2">
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
