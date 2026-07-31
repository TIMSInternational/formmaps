"use client";

/**
 * Personality assessment — untimed binary A/B runner (proprietary instrument).
 * On mount it starts (or RESUMES) a session, serves one item at a time, and
 * advances on each A/B choice. Progress is restored from answered_item_numbers.
 * Runs under the shared proctoring layer (fullscreen + violation capture) with
 * an incremental violation flush that survives a killed tab.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import {
  personalityApi,
  type BinaryChoice,
  type ServedItem,
} from "@/services/personalityService";
import { RequireChromium } from "@/components/proctoring/RequireChromium";
import { ProctoredShell } from "@/components/proctoring/ProctoredShell";
import { useProctoring } from "@/components/proctoring/useProctoring";
import { installViolationFlush, postViolations } from "@/components/proctoring/flushViolations";
import type { LockdownViolation } from "@/components/proctoring/types";
import { PersonalityItemCard } from "./_components/PersonalityItemCard";

type Phase = "loading" | "error" | "already-completed" | "running" | "completing";

export default function PersonalityAssessmentPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language: storeLanguage, setAssessmentActive, user } = useGlobalStore();
  const language: "es" | "en" = storeLanguage === "english" ? "en" : "es";

  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<ServedItem[]>([]);
  const [answeredChoices, setAnsweredChoices] = useState<Record<number, BinaryChoice>>({});
  const [answeredNumbers, setAnsweredNumbers] = useState<Set<number>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);

  const proctoring = useProctoring({
    onFlush: (v) => {
      if (!sessionId) return;
      postViolations(
        `${process.env.NEXT_PUBLIC_API_BASE_URL || ""}/api/v1/personality/session/${sessionId}/violations`,
        v,
        {
          token: useGlobalStore.getState().user.accessToken,
          // Failed live-flush violations go back into the buffer so the
          // pagehide/tab-hide backstop below re-sends them — no evidence loss.
          requeue: (failed) => { proctoring.violations.current.unshift(...failed); },
        },
      );
    },
  });
  // Destructure the individually-stable callbacks/ref. Depending on the whole
  // `proctoring` object would churn these effects every render (its elapsed
  // clock ticks each second), re-firing begin()/tearing down mid-exam.
  const { begin, end, drainViolations, violations } = proctoring;
  const startedRef = useRef(false);

  // Start or resume the session on mount. No persistent ref-guard: under React
  // StrictMode (dev) the effect mounts→cleanup→remounts, and a ref-guard would
  // let the cleanup cancel mount #1's fetch while blocking mount #2's — leaving
  // `phase` stuck on "loading" forever. The per-invocation `cancelled` flag is
  // the StrictMode-safe idiom (mirrors useLiaFlow); the harmless dev double-fetch
  // resolves to a single in-progress session server-side (start resumes it).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const access = await personalityApi.getAccess();
        if (cancelled) return;
        if (access.has_completed) {
          setPhase("already-completed");
          return;
        }
        const started = await personalityApi.start({ language });
        if (cancelled) return;
        setSessionId(started.session_id);
        setItems(started.items);
        const restored = new Set(started.answered_item_numbers);
        setAnsweredNumbers(restored);
        // Resume at the first unanswered item (or the last item if all answered).
        const firstUnanswered = started.items.findIndex((it) => !restored.has(it.n));
        setCurrentIndex(firstUnanswered === -1 ? Math.max(0, started.items.length - 1) : firstUnanswered);
        setPhase("running");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [language]);

  // Block the AI chat while the exam is live.
  useEffect(() => {
    setAssessmentActive(phase === "running");
    return () => setAssessmentActive(false);
  }, [phase, setAssessmentActive]);

  // Begin proctoring once the runner is live; end on unmount.
  useEffect(() => {
    if (phase === "running" && !startedRef.current) {
      startedRef.current = true;
      begin();
    }
  }, [phase, begin]);
  useEffect(() => () => end(), [end]);

  // Incremental violation flush that survives a killed tab (keepalive fetch,
  // cookie + Bearer authed), so flag_for_review still lands if the tab dies.
  useEffect(() => {
    if (!sessionId) return;
    return installViolationFlush({
      url: `${process.env.NEXT_PUBLIC_API_BASE_URL || ""}/api/v1/personality/session/${sessionId}/violations`,
      transport: "keepalive",
      drain: drainViolations,
      token: () => useGlobalStore.getState().user.accessToken,
      requeue: (v: LockdownViolation[]) => {
        violations.current.unshift(...v);
      },
    });
  }, [sessionId, drainViolations, violations]);

  const total = items.length;
  const answeredCount = answeredNumbers.size;
  const allAnswered = total > 0 && answeredCount >= total;
  const currentItem = items[currentIndex];

  const handleChoose = useCallback(
    async (choice: BinaryChoice) => {
      if (!sessionId || !currentItem) return;
      const itemNumber = currentItem.n;
      setAnsweredChoices((prev) => ({ ...prev, [itemNumber]: choice }));
      setAnsweredNumbers((prev) => {
        const next = new Set(prev);
        next.add(itemNumber);
        return next;
      });
      // Advance to the next item (untimed; the last item stays put so Finish shows).
      setCurrentIndex((idx) => (idx < items.length - 1 ? idx + 1 : idx));
      try {
        await personalityApi.answer(sessionId, itemNumber, choice);
      } catch {
        // The optimistic mark is now ahead of the server. Roll it back so the
        // Finish gate can't be satisfied on an unsaved item, and tell the user.
        setAnsweredNumbers((prev) => {
          const next = new Set(prev);
          next.delete(itemNumber);
          return next;
        });
        toast.error(t("personality.answerError"));
      }
    },
    [sessionId, currentItem, items.length, t],
  );

  const goBack = useCallback(() => setCurrentIndex((idx) => Math.max(0, idx - 1)), []);
  const goNext = useCallback(
    () => setCurrentIndex((idx) => Math.min(items.length - 1, idx + 1)),
    [items.length],
  );

  const handleFinish = useCallback(async () => {
    if (!sessionId || !allAnswered) return;
    setPhase("completing");
    try {
      await personalityApi.complete(sessionId);
      end();
      router.push("/dashboard/assessments/personality/results");
    } catch {
      // Complete failed (most likely a coverage gap from an answer that never
      // saved). Re-sync answered state from the server so the Finish gate
      // reflects reality and jump to the first still-unanswered item.
      toast.error(t("personality.finishError"));
      try {
        const resynced = await personalityApi.start({ language });
        setItems(resynced.items);
        const restored = new Set(resynced.answered_item_numbers);
        setAnsweredNumbers(restored);
        const firstUnanswered = resynced.items.findIndex((it) => !restored.has(it.n));
        if (firstUnanswered !== -1) setCurrentIndex(firstUnanswered);
      } catch {
        /* leave state as-is; the user can retry or reload */
      }
      setPhase("running");
    }
  }, [sessionId, allAnswered, end, router, language, t]);

  const progressPct = useMemo(() => (total > 0 ? Math.round((answeredCount / total) * 100) : 0), [answeredCount, total]);

  // Wrap a live runner in the browser gate + proctoring chrome.
  const watermark = user?.email ? { email: user.email } : undefined;
  const proctored = (node: ReactNode) => (
    <RequireChromium>
      <ProctoredShell proctoring={proctoring} watermark={watermark}>{node}</ProctoredShell>
    </RequireChromium>
  );

  if (phase === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#065292] animate-spin" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card rounded-2xl border border-border shadow-sm p-8 text-center">
          <AlertTriangle className="w-14 h-14 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-2">{t("personality.errorTitle")}</h1>
          <p className="text-muted-foreground mb-6">{t("personality.errorBody")}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-[#065292] hover:bg-[#054275] text-white font-semibold rounded-xl transition-colors"
          >
            {t("personality.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "already-completed") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-card rounded-2xl border border-border shadow-sm p-8">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">{t("personality.completedTitle")}</h2>
          <p className="text-muted-foreground mb-6">{t("personality.completedBody")}</p>
          <button
            onClick={() => router.push("/dashboard/assessments/personality/results")}
            className="w-full py-3 bg-[#065292] text-white rounded-xl font-semibold hover:bg-[#054275] transition-colors"
          >
            {t("personality.viewResults")}
          </button>
        </div>
      </div>
    );
  }

  return proctored(
    <div className="min-h-screen bg-background">
      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-foreground">
              {t("personality.itemLabel", { current: currentIndex + 1, total })}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {answeredCount} / {total}
            </span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className="bg-[#065292] h-full rounded-full transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Item */}
        {phase === "completing" ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-10 h-10 text-[#065292] animate-spin mb-4" />
            <p className="text-muted-foreground">{t("personality.finishing")}</p>
          </div>
        ) : currentItem ? (
          <PersonalityItemCard
            item={currentItem}
            selected={answeredChoices[currentItem.n]}
            onChoose={handleChoose}
          />
        ) : null}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={goBack}
            disabled={currentIndex === 0 || phase === "completing"}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground border border-border bg-card hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("personality.back")}
          </button>

          {allAnswered ? (
            <button
              onClick={handleFinish}
              disabled={phase === "completing"}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-[#065292] hover:bg-[#054275] disabled:opacity-60 transition-colors"
            >
              {t("personality.finish")}
              <CheckCircle2 className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={goNext}
              disabled={currentIndex >= items.length - 1 || phase === "completing"}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground border border-border bg-card hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t("personality.next")}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t("personality.runnerHint")}
        </p>
      </main>
    </div>,
  );
}
