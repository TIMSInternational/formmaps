"use client";

/**
 * Shared proctoring chrome for any assessment runner. Generalized from LIA's
 * inline `lockdownChrome`: a blocking overlay for a second monitor, a
 * return-to-fullscreen prompt, an opaque focus-lost overlay that HIDES the
 * questions until refocus, and a slim elapsed-time bar. All copy via i18n
 * `proctoring.*`. Visual language matches LIA's FlowScreens (navy overlays,
 * green "secure mode" badge).
 *
 * Every blocking overlay carries a secondary "Save and exit" so a taker is never
 * trapped (#391): it flushes violations, ends the session (answers are already
 * saved server-side per item) and navigates to `exitHref`. When fullscreen is
 * unavailable the shell shows a non-blocking banner instead of an overlay.
 */
import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Info, Lock, LogOut, Maximize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Proctoring } from "./useProctoring";

function SaveAndExitButton({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onExit}
      className="mt-6 w-full py-3 px-6 rounded-xl border border-white/30 text-white/90 font-medium hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
    >
      <LogOut className="w-5 h-5" />
      {t("proctoring.saveAndExit")}
    </button>
  );
}

function BlockingOverlay({ title, body, onExit }: { title: string; body: string; onExit: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-[#0F172A] text-white flex items-center justify-center p-8 text-center">
      <div className="max-w-md w-full">
        <h2 className="text-2xl font-bold mb-2 text-white">{title}</h2>
        <p className="text-white/80">{body}</p>
        <SaveAndExitButton onExit={onExit} />
      </div>
    </div>
  );
}

/**
 * Screenshot-deterrent overlay: a faint tiled stamp of the taker's email +
 * capture timestamp. Honest limit (documented elsewhere): browsers cannot
 * block OS-level screenshots, so this — plus recording — is the ceiling
 * short of a native lockdown browser. It only raises the cost/traceability
 * of a leaked screenshot.
 */
function Watermark({ email }: { email: string }) {
  const stamp = `${email} · ${new Date().toISOString()}`;
  const tiles = Array.from({ length: 24 });
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none z-40 opacity-[0.06] grid grid-cols-4 grid-rows-6 place-items-center overflow-hidden"
    >
      {tiles.map((_, i) => (
        <span key={i} className="text-xs font-mono text-black whitespace-nowrap -rotate-[20deg]">
          {stamp}
        </span>
      ))}
    </div>
  );
}

export function ProctoredShell({
  proctoring,
  children,
  showTimer = true,
  watermark,
  exitHref = "/dashboard/assessments",
}: {
  proctoring: Proctoring;
  children: ReactNode;
  showTimer?: boolean;
  /** Where "Save and exit" navigates. Default `/dashboard/assessments`. */
  exitHref?: string;
  /** When set, renders a tiled screenshot-deterrent watermark of the taker's email + timestamp. */
  watermark?: { email: string };
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { active, elapsedTime, needsFullscreenPrompt, focusLost, multiDisplay, fullscreenUnavailable, enterFullscreen, exit } = proctoring;
  const saveAndExit = () => {
    exit();
    router.push(exitHref);
  };

  return (
    <>
      {watermark && <Watermark email={watermark.email} />}

      {active && showTimer && (
        <div className="bg-[#0F172A] text-white py-2 px-4 flex items-center justify-between text-sm sticky top-0 z-20">
          <span className="bg-[#10B981] px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1">
            <Lock className="w-3 h-3" />
            {t("proctoring.timerLabel")}
          </span>
          <span className="text-white/70 font-mono">{elapsedTime}</span>
        </div>
      )}

      {active && fullscreenUnavailable && (
        <div role="status" className="bg-amber-50 text-amber-900 border-b border-amber-200 px-4 py-2 text-sm flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          {t("proctoring.fullscreenUnavailableBanner")}
        </div>
      )}

      {children}

      {active && multiDisplay && (
        <BlockingOverlay title={t("proctoring.multiDisplayTitle")} body={t("proctoring.multiDisplayBody")} onExit={saveAndExit} />
      )}

      {active && needsFullscreenPrompt && !multiDisplay && (
        <div className="fixed inset-0 z-[60] bg-[#0F172A] flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="w-20 h-20 bg-[#1E293B] rounded-full flex items-center justify-center mx-auto mb-6">
              <Maximize2 className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">{t("proctoring.fullscreenTitle")}</h2>
            <p className="text-white/70 mb-8 text-lg">{t("proctoring.fullscreenBody")}</p>
            <button
              onClick={enterFullscreen}
              className="w-full py-4 px-6 bg-emerald-700 text-white rounded-xl font-semibold text-lg hover:bg-emerald-800 transition-colors flex items-center justify-center gap-3"
            >
              <Maximize2 className="w-6 h-6" />
              {t("proctoring.fullscreenButton")}
            </button>
            <SaveAndExitButton onExit={saveAndExit} />
          </div>
        </div>
      )}

      {active && focusLost && !needsFullscreenPrompt && !multiDisplay && (
        <BlockingOverlay title={t("proctoring.focusLostTitle")} body={t("proctoring.focusLostBody")} onExit={saveAndExit} />
      )}
    </>
  );
}
