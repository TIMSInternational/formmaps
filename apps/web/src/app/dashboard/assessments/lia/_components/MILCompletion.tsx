"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useGlobalStore } from "@/store/useGlobalStore";
import { getSelfEvaluationUrl } from "@/services/evaluationService";
import { toast } from "sonner";

interface MILCompletionProps {
  onViewResults: () => void;
  onReturnToDashboard: () => void;
}

export default function MILCompletion({
  onReturnToDashboard,
}: MILCompletionProps) {
  const router = useRouter();
  const { user, language } = useGlobalStore();
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
        toast.error("Failed to start evaluation. Please try again.");
      }
    } catch {
      toast.error("Failed to start evaluation. Please try again.");
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
            LIA Assessment Complete!
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-muted-foreground mb-8 leading-relaxed"
          >
            Thank you for completing all 5 subtests. Your responses have been saved and will be reviewed by your counselor.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-[#102B47]/5 border border-[#2E9098]/30 rounded-lg p-5 mb-6 text-left"
          >
            <p className="text-sm font-semibold text-[#2E9098] mb-1">Next Step</p>
            <p className="text-sm text-[#2E9098]">
              Complete the <strong>360° Evaluation</strong> — start by evaluating yourself, then invite peers, parents, and teachers to evaluate you.
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
                <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
              ) : (
                <>Start 360° Self-Evaluation <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
            <button
              onClick={onReturnToDashboard}
              className="w-full bg-secondary text-foreground py-3 px-6 rounded-lg hover:bg-secondary/80 transition-colors font-medium border"
            >
              Return to Dashboard
            </button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
