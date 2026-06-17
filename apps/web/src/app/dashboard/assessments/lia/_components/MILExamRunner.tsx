"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import {
  MILExamId,
  startMILExam,
  MILExam,
  MILSession,
  MILAnswer,
  saveMILSession,
  loadMILSession,
  clearMILSession,
  setupTabFocusMonitoring,
  submitMILExam,
  completeMILExam,
} from "@/services/milService";
import { useGlobalStore } from "@/store/useGlobalStore";
import { toast } from "sonner";
import ExamProgressHeader from "./ExamProgressHeader";
import {
  renderLetterPairs,
  renderLetterSequence,
  renderNumberSequence,
  renderVisualRotation,
  renderAnswerOptions,
} from "./ExamQuestionRenderers";

interface MILExamRunnerProps {
  examId: MILExamId;
  onComplete: () => void;
  onBack: () => void;
}

export default function MILExamRunner({
  examId,
  onComplete,
  onBack,
}: MILExamRunnerProps) {
  const [exam, setExam] = useState<MILExam | null>(null);
  const [session, setSession] = useState<MILSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tabViolations, setTabViolations] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const [isTabActive, setIsTabActive] = useState(true);
  const [showViolationToast, setShowViolationToast] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const { user, language, setAssessmentActive } = useGlobalStore();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupTabMonitoringRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Mark an assessment as in progress — blocks/closes the AI chat for its duration.
    setAssessmentActive(true);
    initializeExam();
    return () => {
      setAssessmentActive(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (cleanupTabMonitoringRef.current) cleanupTabMonitoringRef.current();
    };
  }, [examId]);

  useEffect(() => {
    if (session && exam) {
      startTimer();
      setupTabMonitoring();
    }
  }, [session, exam]);

  const initializeExam = async () => {
    try {
      setLoading(true);
      const existingSession = loadMILSession(examId);
      const canResume = existingSession && !existingSession.isCompleted && (() => {
        const elapsed = Math.floor((Date.now() - new Date(existingSession.startTime).getTime()) / 1000);
        return elapsed < 600;
      })();

      if (canResume && existingSession) {
        const examData = await startMILExam(examId, language);
        setExam(examData);
        setSession(existingSession);
        setCurrentQuestionIndex(existingSession.currentQuestion);
        const elapsed = Math.floor(
          (Date.now() - new Date(existingSession.startTime).getTime()) / 1000
        );
        const remaining = Math.max(30, examData.timeLimitMinutes * 60 - elapsed);
        setTimeRemaining(remaining);
      } else {
        if (existingSession) clearMILSession(examId);
        const examData = await startMILExam(examId, language);
        const newSession: MILSession = {
          examId,
          apiSessionId: examData.sessionId,
          startTime: new Date().toISOString(),
          answers: [],
          currentQuestion: 0,
          isCompleted: false,
        };
        setExam(examData);
        setSession(newSession);
        setTimeRemaining(examData.timeLimitMinutes * 60);
        saveMILSession(newSession);
      }
      setQuestionStartTime(Date.now());
    } catch (err: unknown) {
      // If 409 (already completed), signal parent to skip this exam
      const status = (err as { status?: number })?.status;
      if (status === 409) {
        onComplete();
        return;
      }
    } finally {
      setLoading(false);
    }
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const setupTabMonitoring = () => {
    const cleanup = setupTabFocusMonitoring(
      () => {
        setIsTabActive(false);
        if (!showTabWarning) {
          setTabViolations((prev) => {
            const newCount = prev + 1;
            setShowViolationToast(true);
            setTimeout(() => setShowViolationToast(false), 3000);
            if (newCount >= 3) {
              setTimeout(() => handleTabViolationRestart(), 2000);
            }
            return newCount;
          });
          setShowTabWarning(true);
        }
      },
      () => {
        setIsTabActive(true);
        setTimeout(() => setShowTabWarning(false), 1000);
      }
    );
    cleanupTabMonitoringRef.current = cleanup;
  };

  const handleTabViolationRestart = () => {
    if (session) {
      clearMILSession(session.examId);
      window.location.reload();
    }
  };

  const handleTimeUp = useCallback(async () => {
    if (session && !session.isCompleted) {
      try {
        setIsSubmitting(true);
        const updatedSession: MILSession = { ...session, isCompleted: true };
        saveMILSession(updatedSession);
        if (user?.id && !hasSubmitted) {
          setHasSubmitted(true);
          await completeMILExam(updatedSession, user.id, language);
          clearMILSession(updatedSession.examId);
        }
      } catch {
        // error handled silently
      } finally {
        setIsSubmitting(false);
      }
    }
    onComplete();
  }, [session, user?.id, language, onComplete, hasSubmitted]);

  const handleAnswerSelect = (answer: number) => {
    setSelectedAnswer(answer);
  };

  const handleContinue = async () => {
    if (!session || !exam || selectedAnswer === null) return;

    const timeSpent = Date.now() - questionStartTime;
    const answer: MILAnswer = {
      questionNumber: currentQuestionIndex + 1,
      answer: selectedAnswer,
      timeSpent,
      timestamp: new Date().toISOString(),
    };

    const updatedAnswers = [...session.answers];
    updatedAnswers[currentQuestionIndex] = answer;

    const updatedSession: MILSession = {
      ...session,
      answers: updatedAnswers,
      currentQuestion: currentQuestionIndex + 1,
      isCompleted: currentQuestionIndex + 1 >= exam.questions.length,
    };

    setSession(updatedSession);
    saveMILSession(updatedSession);

    if (currentQuestionIndex + 1 >= exam.questions.length) {
      if (user?.id && !hasSubmitted && !isSubmitting) {
        try {
          setIsSubmitting(true);
          setHasSubmitted(true);
          await submitMILExam(updatedSession, user.id);
          clearMILSession(updatedSession.examId);
        } catch {
          setHasSubmitted(false);
          toast.error("Failed to submit exam. Your answers have been saved locally.");
        } finally {
          setIsSubmitting(false);
        }
      }
      onComplete();
    } else {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setQuestionStartTime(Date.now());
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#065292] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading assessment...</p>
        </div>
      </div>
    );
  }

  if (!exam || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Assessment Error</h3>
          <p className="text-muted-foreground mb-4">Failed to load assessment</p>
          <button onClick={onBack} className="bg-gray-600 text-white px-6 py-3 rounded-xl hover:bg-gray-700 transition-colors">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!exam.questions || exam.questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No questions available for this assessment. Questions need to be configured.</p>
          <button onClick={onBack} className="bg-gray-600 text-white px-6 py-3 rounded-xl hover:bg-gray-700 transition-colors">Go Back</button>
        </div>
      </div>
    );
  }

  const currentQuestion = exam.questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-background">
      <ExamProgressHeader
        exam={exam}
        currentQuestionIndex={currentQuestionIndex}
        timeRemaining={timeRemaining}
        tabViolations={tabViolations}
        showViolationToast={showViolationToast}
        showTabWarning={showTabWarning}
        isTabActive={isTabActive}
        onBack={onBack}
      />

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-80px)] p-2 sm:p-4 md:p-6 lg:p-8">
        <div className="w-full max-w-5xl">
          <motion.div
            key={currentQuestionIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.1 }}
            className="bg-card/95 backdrop-blur-md rounded-xl sm:rounded-2xl shadow-xl border border-white/30 p-3 sm:p-6 md:p-8"
          >
            {/* Question Header */}
            <div className="text-center mb-4 sm:mb-6 md:mb-8">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.1 }} className="mb-3 sm:mb-4 md:mb-6">
                <div className="inline-flex items-center px-2 sm:px-3 py-1 bg-[#065292]/10 rounded-full mb-2 sm:mb-4">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#065292] rounded-full mr-2 sm:mr-3"></div>
                  <span className="text-xs sm:text-sm font-medium text-foreground">
                    Question {currentQuestionIndex + 1} of {exam.questions.length}
                  </span>
                </div>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.1 }}
                className="text-base sm:text-lg md:text-xl font-bold text-foreground mb-3 sm:mb-4 md:mb-6 px-2"
              >
                {currentQuestion.questionText}
              </motion.h2>

              {renderLetterPairs(currentQuestion)}
              {renderLetterSequence(currentQuestion)}
              {renderNumberSequence(currentQuestion)}
              {renderVisualRotation(currentQuestion)}
            </div>

            {/* Answer Options */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.1 }}
              className="flex justify-center flex-wrap gap-2 sm:gap-3 mb-6 sm:mb-8 max-w-4xl mx-auto px-2"
            >
              {renderAnswerOptions(currentQuestion, selectedAnswer, handleAnswerSelect, isSubmitting)}
            </motion.div>

            {/* Continue Button — boxed & prominent */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.1 }}
              className="mt-4 sm:mt-6 border-t-2 border-[#065292]/15 pt-4 sm:pt-6 px-2 sm:px-4"
            >
              <div className="max-w-md mx-auto rounded-2xl border-2 border-[#065292]/30 bg-[#065292]/[0.05] p-3 sm:p-4 shadow-lg">
                <button
                  onClick={handleContinue}
                  disabled={selectedAnswer === null || isSubmitting}
                  className="w-full bg-[#065292] text-white px-6 py-4 sm:py-5 rounded-xl hover:bg-[#054a83] transition-all duration-100 font-bold text-lg sm:text-xl disabled:opacity-50 disabled:cursor-not-allowed shadow-xl flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Submitting...</span>
                    </>
                  ) : currentQuestionIndex + 1 >= exam.questions.length ? (
                    "Complete Assessment"
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
