"use client";

/**
 * Shared LIA flow screens ported from tims-suite LIAEvaluation: fullscreen
 * overlay, lockdown status bar, assessment progress header, error screen,
 * overview/start card. Layout and interactions are tims-parity; colors are
 * FormMaps brand tokens (navy #102B47 for TIMS purple).
 */
import { Clock, HelpCircle, Maximize2, Lock, AlertTriangle } from "lucide-react";
import { SUBTEST_CONFIG, SUBTEST_ORDER, type LIASubtest } from "@/services/liaService";
import { LIATimer } from "./LIATimer";

export function FullscreenOverlay({ language, onEnter }: { language: "es" | "en"; onEnter: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-[#1E293B] rounded-full flex items-center justify-center mx-auto mb-6">
          <Maximize2 className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">
          {language === "es" ? "Pantalla Completa Requerida" : "Fullscreen Required"}
        </h2>
        <p className="text-white/70 mb-8 text-lg">
          {language === "es"
            ? "Para garantizar la integridad del examen, debes completar la evaluación en modo de pantalla completa."
            : "To ensure exam integrity, you must complete the assessment in fullscreen mode."}
        </p>
        <button
          onClick={onEnter}
          className="w-full py-4 px-6 bg-[#10B981] text-white rounded-xl font-semibold text-lg hover:bg-[#059669] transition-colors flex items-center justify-center gap-3"
        >
          <Maximize2 className="w-6 h-6" />
          {language === "es" ? "Entrar en Pantalla Completa" : "Enter Fullscreen"}
        </button>
      </div>
    </div>
  );
}

export function LockdownBar({ language, elapsedTime }: { language: "es" | "en"; elapsedTime: string }) {
  return (
    <div className="bg-[#0F172A] text-white py-2 px-4 flex items-center justify-between text-sm sticky top-0 z-20">
      <div className="flex items-center gap-2">
        <span className="bg-[#10B981] px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1">
          <Lock className="w-3 h-3" />
          {language === "es" ? "Modo Seguro" : "Secure Mode"}
        </span>
      </div>
      <span className="text-white/70 font-mono">{elapsedTime}</span>
    </div>
  );
}

export function ErrorScreen({ language, onRetry }: { language: "es" | "en"; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
        <p className="text-gray-600 mb-6">
          {language === "es"
            ? "No se pudo cargar la evaluación. Inténtalo de nuevo."
            : "The assessment could not be loaded. Please try again."}
        </p>
        <button
          onClick={onRetry}
          className="px-6 py-3 bg-[#102B47] text-white rounded-lg font-medium hover:bg-[#0b1f33] transition-colors"
        >
          {language === "es" ? "Reintentar" : "Retry"}
        </button>
      </div>
    </div>
  );
}

export function ProgressHeader({
  language,
  currentSubtest,
  currentSubtestIndex,
  currentQuestionIndex,
  lockdownActive,
  subtestStartTime,
  timeLimitSeconds,
  onTimeout,
  onWarning,
}: {
  language: "es" | "en";
  currentSubtest: LIASubtest;
  currentSubtestIndex: number;
  currentQuestionIndex: number;
  lockdownActive: boolean;
  subtestStartTime: Date;
  timeLimitSeconds: number;
  onTimeout: () => void;
  onWarning: (secondsLeft: number) => void;
}) {
  const config = SUBTEST_CONFIG[currentSubtest];
  const totalItems = config.itemCount;
  const progressPercentage = Math.round((currentQuestionIndex / totalItems) * 100);

  return (
    <header className={`bg-white shadow-sm sticky z-10 ${lockdownActive ? "top-[40px]" : "top-0"}`}>
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {SUBTEST_ORDER.map((subtest, index) => (
              <div
                key={subtest}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                  index < currentSubtestIndex
                    ? "bg-green-500 text-white"
                    : index === currentSubtestIndex
                      ? "bg-[#102B47] text-white"
                      : "bg-gray-200 text-gray-500"
                }`}
                title={SUBTEST_CONFIG[subtest].displayName[language]}
              >
                {index < currentSubtestIndex ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
            ))}
          </div>
          <LIATimer totalSeconds={timeLimitSeconds} startedAt={subtestStartTime} onTimeout={onTimeout} onWarning={onWarning} />
        </div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{config.displayName[language]}</h2>
            <p className="text-sm text-gray-500">
              {language === "es" ? "Pregunta" : "Question"} {currentQuestionIndex + 1} / {totalItems}
            </p>
          </div>
          <span className="text-sm text-gray-500">{progressPercentage}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-[#102B47] transition-all duration-500" style={{ width: `${progressPercentage}%` }} />
        </div>
      </div>
    </header>
  );
}

export function OverviewCard({
  language,
  resuming,
  onBegin,
}: {
  language: "es" | "en";
  resuming: boolean;
  onBegin: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-sm p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {language === "es" ? "Medición de Inteligencia Laboral (MIL)" : "Labor Intelligence Assessment (LIA)"}
        </h1>
        <p className="text-gray-600 mb-6">
          {language === "es"
            ? "Evaluación cognitiva de 5 subpruebas: reconocimiento de patrones, razonamiento verbal, velocidad numérica, memoria de trabajo y rotación visual."
            : "A 5-subtest cognitive assessment: pattern recognition, verbal reasoning, numerical speed, working memory, and visual rotation."}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 text-center">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-[#102B47]">5</p>
            <p className="text-sm text-gray-500">{language === "es" ? "Subpruebas" : "Subtests"}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-[#102B47]">305</p>
            <p className="text-sm text-gray-500">{language === "es" ? "Ítems" : "Items"}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-[#102B47]">~25</p>
            <p className="text-sm text-gray-500">{language === "es" ? "Minutos" : "Minutes"}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 text-sm text-gray-500 mb-6">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            {language === "es"
              ? "Cada subprueba es cronometrada y comienza con una práctica corta. La evaluación se realiza en modo seguro (pantalla completa)."
              : "Each subtest is timed and begins with a short practice. The assessment runs in secure mode (fullscreen)."}
          </p>
        </div>
        <div className="flex items-start gap-2 text-sm text-gray-500 mb-8">
          <HelpCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            {language === "es"
              ? "Solo puedes completar esta evaluación una vez. Si sales, podrás reanudarla donde quedaste."
              : "You can only complete this assessment once. If you leave, you can resume where you left off."}
          </p>
        </div>
        <button
          onClick={onBegin}
          className="w-full py-4 bg-[#102B47] text-white rounded-xl font-semibold text-lg hover:bg-[#0b1f33] transition-colors"
        >
          {resuming
            ? language === "es"
              ? "Reanudar Evaluación"
              : "Resume Assessment"
            : language === "es"
              ? "Comenzar Evaluación"
              : "Start Assessment"}
        </button>
      </div>
    </div>
  );
}
