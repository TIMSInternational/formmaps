"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useGlobalStore } from "@/store/useGlobalStore";
import { getSelfEvaluationUrl } from "@/services/evaluationService";
import { toast } from "sonner";
import { Trans, useTranslation } from "react-i18next";
import { toStoreLanguage, useContentLanguage } from "@/lib/i18n/contentLanguage";

interface MILCompletionProps {
  onViewResults: () => void;
  onReturnToDashboard: () => void;
}

export default function MILCompletion({
  onReturnToDashboard,
}: MILCompletionProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useGlobalStore();
  const language = toStoreLanguage(useContentLanguage());
  const [starting, setStarting] = useState(false);

  const handleStart360 = async () => {
    try {
      setStarting(true);
      const selfEval = await getSelfEvaluationUrl(
        user?.id || "",
        user?.name || "Self",
        user?.email || "",
        language
      );
      if (selfEval) {
        if (selfEval.completed) {
          // Self-eval already done — go to evaluator management
          router.push("/dashboard/assessments/evaluation");
        } else {
          router.push(selfEval.url);
        }
      } else {
        toast.error(t("evaluation.page.startFailed"));
      }
    } catch {
      toast.error(t("evaluation.page.startFailed"));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center">
      <div className="max-w-lg mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="bg-card rounded-lg shadow-lg border p-8 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-2xl font-bold text-foreground mb-3"
          >
            {t("lia.completion.title")}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-muted-foreground mb-8 leading-relaxed"
          >
            {t("lia.completion.body")}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-[#102B47]/5 border border-[var(--admin-accent-blue)]/30 rounded-lg p-5 mb-6 text-left"
          >
            <p className="text-sm font-semibold text-[var(--admin-accent-blue)] mb-1">{t("lia.completion.nextStep")}</p>
            <p className="text-sm text-[var(--admin-accent-blue)]">
              <Trans
                i18nKey="lia.completion.nextStepBody"
                components={{ strong: <strong /> }}
              />
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col gap-3"
          >
            <button
              onClick={handleStart360}
              disabled={starting}
              className="w-full bg-[#102B47] text-white py-3 px-6 rounded-lg hover:bg-[#0b1f33] transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {starting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t("evaluation.page.starting")}</>
              ) : (
                <>{t("lia.completion.start360")} <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
            <button
              onClick={onReturnToDashboard}
              className="w-full bg-secondary text-foreground py-3 px-6 rounded-lg hover:bg-secondary/80 transition-colors font-medium border"
            >
              {t("dashboard.returnToDashboard")}
            </button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
