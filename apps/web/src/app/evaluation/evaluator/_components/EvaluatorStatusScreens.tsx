"use client";

import { motion } from "motion/react";
import { CheckCircle2, LinkIcon, Loader2 } from "lucide-react";

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Loading evaluation...</p>
      </div>
    </div>
  );
}

interface ErrorScreenProps {
  error: string;
}

export function ErrorScreen({ error }: ErrorScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
          <LinkIcon className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">Link Not Available</h2>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <p className="text-xs text-muted-foreground">Please contact your administrator</p>
      </div>
    </div>
  );
}

export function SuccessScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-sm w-full text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Thank You!</h2>
        <p className="text-sm text-muted-foreground">
          Your evaluation has been submitted successfully. Redirecting...
        </p>
      </motion.div>
    </div>
  );
}

export function AlreadySubmittedScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-blue-600" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">Already Submitted</h2>
        <p className="text-sm text-muted-foreground">
          This evaluation has already been completed. Thank you for your participation!
        </p>
      </div>
    </div>
  );
}
