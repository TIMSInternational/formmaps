"use client";

import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, LinkIcon, Loader2 } from "lucide-react";

export function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{t("evaluation.evaluator.loading")}</p>
      </div>
    </div>
  );
}

interface ErrorScreenProps {
  error: string;
}

export function ErrorScreen({ error }: ErrorScreenProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
          <LinkIcon className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">{t("evaluation.evaluator.linkNotAvailable")}</h2>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <p className="text-xs text-muted-foreground">{t("evaluation.evaluator.contactAdmin")}</p>
      </div>
    </div>
  );
}

export function SuccessScreen({ returnHref }: { returnHref?: string }) {
  const { t } = useTranslation();
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
        <h2 className="text-xl font-bold text-foreground mb-2">{t("evaluation.evaluator.thankYou")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("evaluation.evaluator.successBody")}
        </p>
        {/* Only authenticated users (e.g. a student finishing their own
            self-evaluation) get a way back into the app. External evaluators
            reach this page via a token link with no session and must never be
            routed into the student's dashboard. */}
        {returnHref && (
          <a
            href={returnHref}
            className="inline-block mt-5 px-5 py-2.5 rounded-lg bg-[#102B47] text-white text-sm font-medium hover:bg-[#0b1f33] transition-colors"
          >
            {t("evaluation.evaluator.returnDashboard")}
          </a>
        )}
      </motion.div>
    </div>
  );
}

export function AlreadySubmittedScreen() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-blue-600" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-2">{t("evaluation.evaluator.alreadySubmitted")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("evaluation.evaluator.alreadyBody")}
        </p>
      </div>
    </div>
  );
}
