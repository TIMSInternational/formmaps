"use client";

import { motion, AnimatePresence } from "motion/react";
import { MILExam, formatTime } from "@/services/milService";

interface ExamProgressHeaderProps {
  exam: MILExam;
  currentQuestionIndex: number;
  timeRemaining: number;
  tabViolations: number;
  showViolationToast: boolean;
  showTabWarning: boolean;
  isTabActive: boolean;
  onBack: () => void;
}

export default function ExamProgressHeader({
  exam,
  currentQuestionIndex,
  timeRemaining,
  tabViolations,
  showViolationToast,
  showTabWarning,
  isTabActive,
  onBack,
}: ExamProgressHeaderProps) {
  const progress = ((currentQuestionIndex + 1) / exam.questions.length) * 100;

  return (
    <>
      {/* Violation Toast Notification */}
      <AnimatePresence>
        {showViolationToast && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="fixed top-4 right-4 z-50"
          >
            <div
              className={`rounded-xl p-4 shadow-lg border-l-4 backdrop-blur-sm ${
                tabViolations >= 3
                  ? "bg-red-50/90 border-red-500"
                  : tabViolations >= 2
                  ? "bg-orange-50/90 border-orange-500"
                  : "bg-yellow-50/90 border-yellow-500"
              }`}
            >
              <div className="flex items-center">
                <svg
                  className={`w-5 h-5 mr-3 ${
                    tabViolations >= 3
                      ? "text-red-600"
                      : tabViolations >= 2
                      ? "text-orange-600"
                      : "text-yellow-600"
                  }`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p
                    className={`font-medium ${
                      tabViolations >= 3
                        ? "text-red-600 dark:text-red-400"
                        : tabViolations >= 2
                        ? "text-orange-900"
                        : "text-yellow-600 dark:text-yellow-400"
                    }`}
                  >
                    {tabViolations >= 3
                      ? "Assessment Restarting"
                      : `Tab Switch Warning (${tabViolations}/3)`}
                  </p>
                  <p
                    className={`text-sm ${
                      tabViolations >= 3
                        ? "text-red-700"
                        : tabViolations >= 2
                        ? "text-orange-700"
                        : "text-yellow-700"
                    }`}
                  >
                    {tabViolations >= 3
                      ? "Too many violations. Restarting..."
                      : "Stay focused on the assessment"}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Warning Modal */}
      <AnimatePresence>
        {(showTabWarning || !isTabActive) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="bg-card rounded-2xl p-8 text-center max-w-md shadow-2xl border"
            >
              <div
                className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                  tabViolations >= 3
                    ? "bg-red-100"
                    : tabViolations >= 2
                    ? "bg-orange-100"
                    : "bg-yellow-100"
                }`}
              >
                <svg
                  className={`w-8 h-8 ${
                    tabViolations >= 3
                      ? "text-red-600"
                      : tabViolations >= 2
                      ? "text-orange-600"
                      : "text-yellow-600"
                  }`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-foreground mb-2">
                {tabViolations >= 3
                  ? "Assessment Restarting"
                  : "Return to Assessment"}
              </h3>

              <p className="text-muted-foreground mb-6">
                {tabViolations >= 3
                  ? "You have exceeded the maximum number of tab switches. The assessment will restart automatically."
                  : "Please return to the assessment tab to continue. Switching tabs during the assessment is not allowed."}
              </p>

              {tabViolations < 3 && (
                <p className="text-sm text-muted-foreground">
                  Warning {tabViolations}/3 - After 3 warnings, the assessment
                  will restart.
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-card/90 backdrop-blur-md border-b border-border border-white/20 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-2 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-4 flex-1 min-w-0">
              <button
                onClick={onBack}
                className="flex items-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                <span className="text-xs sm:text-sm">Back</span>
              </button>
              <div className="h-4 sm:h-6 w-px bg-muted flex-shrink-0"></div>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm sm:text-lg md:text-xl font-semibold text-foreground truncate">
                  {exam.name}
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Q {currentQuestionIndex + 1}/{exam.questions.length}
                </p>
              </div>

              {/* Mobile Progress Bar */}
              <div className="sm:hidden flex items-center space-x-2 flex-shrink-0">
                <div className="w-16 bg-muted rounded-full h-1.5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="bg-[#065292] h-1.5 rounded-full transition-all duration-100"
                  />
                </div>
                <span className="text-xs text-muted-foreground min-w-[30px]">
                  {Math.round(progress)}%
                </span>
                <div className="flex items-center space-x-0.5">
                  {exam.questions
                    .slice(0, Math.min(exam.questions.length, 10))
                    .map((_, i) => (
                      <div
                        key={i}
                        className={`w-1 h-1 rounded-full transition-all duration-100 ${
                          i < currentQuestionIndex
                            ? "bg-green-500/10 dark:bg-green-500/200"
                            : i === currentQuestionIndex
                            ? "bg-[#065292]"
                            : "bg-muted"
                        }`}
                      />
                    ))}
                  {exam.questions.length > 10 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      +{exam.questions.length - 10}
                    </span>
                  )}
                </div>
              </div>

              {/* Desktop Progress Bar */}
              <div className="hidden sm:flex items-center space-x-3 flex-shrink-0">
                <div className="w-24 md:w-32 bg-muted rounded-full h-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="bg-[#065292] h-2 rounded-full transition-all duration-100"
                  />
                </div>
                <span className="text-sm text-muted-foreground min-w-[50px]">
                  {Math.round(progress)}%
                </span>
              </div>

              {/* Question Progress Dots - Desktop */}
              <div className="hidden md:flex items-center space-x-1 flex-shrink-0">
                {exam.questions
                  .slice(0, Math.min(exam.questions.length, 20))
                  .map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-100 ${
                        i < currentQuestionIndex
                          ? "bg-green-500/10 dark:bg-green-500/200"
                          : i === currentQuestionIndex
                          ? "bg-[#065292]"
                          : "bg-muted"
                      }`}
                    />
                  ))}
                {exam.questions.length > 20 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    +{exam.questions.length - 20}
                  </span>
                )}
              </div>

              {/* Violation Counter */}
              {tabViolations > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.1 }}
                  className={`flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium flex-shrink-0 ${
                    tabViolations >= 3
                      ? "bg-red-100 text-red-600 dark:text-red-400"
                      : tabViolations >= 2
                      ? "bg-orange-100 text-orange-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  <svg
                    className="w-3 h-3 sm:w-4 sm:h-4 mr-1"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{tabViolations}/3</span>
                </motion.div>
              )}
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
              <div className="text-right">
                <div className="text-sm sm:text-base md:text-lg font-bold text-foreground">
                  {formatTime(timeRemaining)}
                </div>
                <div className="text-xs text-muted-foreground hidden sm:block">
                  Time Remaining
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
