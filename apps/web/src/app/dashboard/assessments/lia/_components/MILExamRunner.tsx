"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MILExamId,
  startMILExam,
  MILExam,
  MILQuestion,
  MILSession,
  MILAnswer,
  saveMILSession,
  loadMILSession,
  clearMILSession,
  formatTime,
  setupTabFocusMonitoring,
  submitMILExam,
  completeMILExam,
} from "@/services/milService";
import { useGlobalStore } from "@/store/useGlobalStore";
import { toast } from "sonner";

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
  const [questionStartTime, setQuestionStartTime] = useState<number>(
    Date.now()
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const { user, language } = useGlobalStore();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupTabMonitoringRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    initializeExam();
    return () => {
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

      // Check for existing session — only resume if time hasn't expired
      const existingSession = loadMILSession(examId);
      const canResume = existingSession && !existingSession.isCompleted && (() => {
        const elapsed = Math.floor((Date.now() - new Date(existingSession.startTime).getTime()) / 1000);
        return elapsed < 600; // 10 min max — discard stale sessions
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
        // Clear stale session
        if (existingSession) clearMILSession(examId);
        // Start new exam
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
    } catch (error) {
      // error handled silently
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
      // Silently restart - no user alert needed
      window.location.reload();
    }
  };

  const handleTimeUp = useCallback(async () => {

    if (session && !session.isCompleted) {
      try {
        setIsSubmitting(true);

        const updatedSession: MILSession = {
          ...session,
          isCompleted: true,
        };
        saveMILSession(updatedSession);

        if (user?.id && !hasSubmitted) {
          setHasSubmitted(true);
          // Use completeMILExam for time-expired submissions (sends isTimeExpired: true)
          await completeMILExam(updatedSession, user.id, language);
          clearMILSession(updatedSession.examId);
        }

      } catch (error) {
      // error handled silently
    } finally {
        setIsSubmitting(false);
      }
    }

    onComplete();
  }, [session, user.id, language, onComplete]);

  const handleAnswerSelect = (answer: number) => {
    const currentQuestion = exam?.questions[currentQuestionIndex];
    let optionText = `Numeric: ${answer}`;

    if (currentQuestion?.data.options) {
      optionText = currentQuestion.data.options[answer];
    } else if (currentQuestion?.data.letterSequence?.outerLetters) {
      optionText = currentQuestion.data.letterSequence.outerLetters[answer];
    } else if (
      currentQuestion?.data.numbers &&
      currentQuestion.data.numbers.length === 3
    ) {
      const numbers = currentQuestion.data.numbers;
      const sortedNumbers = [...numbers].sort((a, b) => a - b);
      const extremes = [sortedNumbers[0], sortedNumbers[2]]; // [lowest, highest]
      optionText = `Number: ${extremes[answer]}`;
    } else if (currentQuestion?.data.visualRotationItems) {
      // Visual Rotation questions use numeric answers (0-4)
      optionText = `Count: ${answer}`;
    }

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

    // If this is the last question, submit the exam
    if (currentQuestionIndex + 1 >= exam.questions.length) {
      if (user?.id && !hasSubmitted && !isSubmitting) {
        try {
          setIsSubmitting(true);
          setHasSubmitted(true);

          const submitResult = await submitMILExam(updatedSession, user.id);
          clearMILSession(updatedSession.examId);
        } catch (error) {
          // Reset hasSubmitted on error to allow retry
          setHasSubmitted(false);
          toast.error("Failed to submit exam. Your answers have been saved locally.");
        } finally {
          setIsSubmitting(false);
        }
      } else if (hasSubmitted) {
      } else if (isSubmitting) {
      } else {
      }

      onComplete();
    } else {
      // Move to next question
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setQuestionStartTime(Date.now());
    }
  };

  const renderLetterPairs = (question: MILQuestion) => {
    if (!question.data.letterPairs) return null;

    return (
      <div className="max-w-2xl mx-auto mb-6 sm:mb-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1 }}
          className="relative bg-card border-2 border-border rounded-xl sm:rounded-2xl p-3 sm:p-6 shadow-xl backdrop-blur-sm"
        >
          {/* Top Row */}
          <div className={`grid gap-2 sm:gap-4 md:gap-8 mb-4 sm:mb-8`} style={{ gridTemplateColumns: `repeat(${question.data.letterPairs.length}, 1fr)` }}>
            {question.data.letterPairs.map((pair, index) => (
              <motion.div
                key={`top-${index}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.02, duration: 0.05 }}
                className="text-center"
              >
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground font-mono tracking-wider drop-shadow-sm">
                  {pair.topLetter}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Divider */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05, duration: 0.1 }}
            className="h-px bg-gradient-to-r from-transparent via-blue-300 to-transparent mb-4 sm:mb-8"
          />

          {/* Bottom Row */}
          <div className={`grid gap-2 sm:gap-4 md:gap-8`} style={{ gridTemplateColumns: `repeat(${question.data.letterPairs.length}, 1fr)` }}>
            {question.data.letterPairs.map((pair, index) => (
              <motion.div
                key={`bottom-${index}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 + index * 0.02, duration: 0.1 }}
                className="text-center"
              >
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground font-mono tracking-wider drop-shadow-sm">
                  {pair.bottomLetter}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    );
  };

  const renderLetterSequence = (question: MILQuestion) => {
    if (!question.data.letterSequence) return null;

    const letters = question.data.letterSequence.letters || question.data.letterSequence.outerLetters;
    if (!letters) return null;

    return (
      <div className="max-w-lg mx-auto mb-6 sm:mb-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1 }}
          className="relative bg-card border-2 border-border rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm"
        >
          {/* Letter Sequence Display */}
          <div className="flex justify-center items-center space-x-4 sm:space-x-6 md:space-x-8">
            {letters.map((letter, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1, duration: 0.2 }}
                className={`text-center ${
                  index === 1 ? "transform scale-110" : ""
                }`}
              >
                <div
                  className={`w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center ${
                    index === 1
                      ? "bg-purple-500/10 dark:bg-purple-500/20 border-2 border-purple-300 shadow-lg"
                      : "bg-muted border-2 border-border"
                  }`}
                >
                  <span className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground font-mono">
                    {letter}
                  </span>
                </div>
                {index === 1 && (
                  <div className="text-xs sm:text-sm text-purple-600 font-medium mt-2">
                    Middle
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Helper text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.2 }}
            className="text-center mt-4 sm:mt-6"
          >
            <p className="text-xs sm:text-sm text-muted-foreground">
              Which outer letter is alphabetically furthest from the middle
              letter?
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  };

  const renderNumberSequence = (question: MILQuestion) => {
    if (!question.data.numbers || question.data.numbers.length !== 3)
      return null;

    const numbers = question.data.numbers;
    const sortedNumbers = [...numbers].sort((a, b) => a - b);
    const lowest = sortedNumbers[0];
    const highest = sortedNumbers[2];
    const middle = sortedNumbers[1];

    return (
      <div className="max-w-lg mx-auto mb-6 sm:mb-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1 }}
          className="relative bg-gradient-to-br from-orange-50 via-yellow-50 to-red-50 border-2 border-orange-200/60 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm"
        >
          {/* Number Sequence Display */}
          <div className="flex justify-center items-center space-x-4 sm:space-x-6 md:space-x-8">
            {numbers.map((number, index) => {
              const isMiddle = number === middle;
              const isExtreme = number === lowest || number === highest;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1, duration: 0.2 }}
                  className={`text-center ${
                    isMiddle ? "transform scale-110" : ""
                  }`}
                >
                  <div
                    className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl flex items-center justify-center ${
                      isMiddle
                        ? "bg-orange-500/10 dark:bg-orange-500/20 border-2 border-orange-300 shadow-lg"
                        : isExtreme
                        ? "bg-red-500/10 dark:bg-red-500/20 border-2 border-red-300 shadow-md"
                        : "bg-muted border-2 border-border"
                    }`}
                  >
                    <span className="text-lg sm:text-xl md:text-2xl font-bold text-foreground font-mono">
                      {number}
                    </span>
                  </div>
                  {isMiddle && (
                    <div className="text-xs sm:text-sm text-orange-600 font-medium mt-2">
                      Middle
                    </div>
                  )}
                  {number === lowest && (
                    <div className="text-xs sm:text-sm text-red-600 font-medium mt-2">
                      Lowest
                    </div>
                  )}
                  {number === highest && (
                    <div className="text-xs sm:text-sm text-red-600 font-medium mt-2">
                      Highest
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Helper text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.2 }}
            className="text-center mt-4 sm:mt-6"
          >
            <p className="text-xs sm:text-sm text-muted-foreground">
              Which extreme (highest or lowest) is furthest from the middle
              number?
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  };

  const renderVisualRotation = (question: MILQuestion) => {
    if (!question.data.visualRotationItems) return null;

    const items = question.data.visualRotationItems;
    // Group items into pairs (top and bottom)
    const pairs = [];
    for (let i = 0; i < items.length; i += 2) {
      if (i + 1 < items.length) {
        pairs.push({
          top: items[i],
          bottom: items[i + 1],
        });
      }
    }

    const getTransform = (item: any) => {
      let transform = "";

      if (item.rotationDegree !== 0) {
        transform += `rotate(${item.rotationDegree}deg)`;
      }

      if (item.isMirrored) {
        transform += " scaleX(-1)";
      }

      return transform || "none";
    };

    return (
      <div className="max-w-2xl mx-auto mb-6 sm:mb-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1 }}
          className="relative bg-card border-2 border-border rounded-xl sm:rounded-2xl p-3 sm:p-6 shadow-xl backdrop-blur-sm"
        >
          {/* Top Row */}
          <div
            className={`grid gap-2 sm:gap-4 md:gap-8 mb-4 sm:mb-8`}
            style={{ gridTemplateColumns: `repeat(${pairs.length}, 1fr)` }}
          >
            {pairs.map((pair, index) => (
              <motion.div
                key={`top-${index}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.02, duration: 0.05 }}
                className="text-center"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-card border-2 border-indigo-300 rounded-lg flex items-center justify-center shadow-sm">
                  <span
                    className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground font-mono inline-block transition-transform duration-200"
                    style={{
                      transform: getTransform(pair.top),
                    }}
                  >
                    {pair.top.letter}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Divider */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05, duration: 0.1 }}
            className="h-px bg-gradient-to-r from-transparent via-indigo-300 to-transparent mb-4 sm:mb-8"
          />

          {/* Bottom Row */}
          <div
            className={`grid gap-2 sm:gap-4 md:gap-8`}
            style={{ gridTemplateColumns: `repeat(${pairs.length}, 1fr)` }}
          >
            {pairs.map((pair, index) => (
              <motion.div
                key={`bottom-${index}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 + index * 0.02, duration: 0.1 }}
                className="text-center"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-card border-2 border-indigo-300 rounded-lg flex items-center justify-center shadow-sm">
                  <span
                    className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground font-mono inline-block transition-transform duration-200"
                    style={{
                      transform: getTransform(pair.bottom),
                    }}
                  >
                    {pair.bottom.letter}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Helper text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.2 }}
            className="text-center mt-4 sm:mt-6"
          >
            <p className="text-xs sm:text-sm text-muted-foreground">
              How many bottom figures are identical to the ones directly above
              them, after rotating them in any direction?
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  };

  const renderAnswerOptions = (question: MILQuestion) => {
    // Check if question has API-provided options (for Verbal Reasoning, etc.)
    if (question.data.options && question.data.options.length > 0) {
      return question.data.options.map((option, index) => (
        <button
          key={index}
          onClick={() => handleAnswerSelect(index)}
          disabled={isSubmitting}
          className={`px-3 py-2 sm:px-4 sm:py-3 rounded-xl font-medium text-xs sm:text-sm transition-all duration-100 min-w-[100px] sm:min-w-[120px] max-w-[180px] sm:max-w-[200px] text-center ${
            selectedAnswer === index
              ? "bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-2xl transform scale-105 ring-4 ring-blue-200/50"
              : "bg-card border-2 border-border text-foreground hover:border-blue-300 hover:bg-blue-50 shadow-lg hover:shadow-xl"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <span className="block leading-tight">{option}</span>
        </button>
      ));
    }

    // Check if question has letter sequence (for Working Memory)
    if (
      question.data.letterSequence &&
      question.data.letterSequence.outerLetters
    ) {
      return question.data.letterSequence.outerLetters.map((letter, index) => (
        <button
          key={index}
          onClick={() => handleAnswerSelect(index)}
          disabled={isSubmitting}
          className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl sm:rounded-2xl font-bold text-xl sm:text-2xl md:text-3xl transition-all duration-100 ${
            selectedAnswer === index
              ? "bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-2xl transform scale-105 sm:scale-110 ring-2 sm:ring-4 ring-purple-200/50"
              : "bg-card border-2 border-border text-foreground hover:border-purple-300 hover:bg-purple-50 shadow-lg hover:shadow-xl"
          } disabled:opacity-50 disabled:cursor-not-allowed font-mono`}
        >
          {letter}
        </button>
      ));
    }

    // Check if question has numbers (for Numeric Velocity)
    if (question.data.numbers && question.data.numbers.length === 3) {
      const numbers = question.data.numbers;
      const sortedNumbers = [...numbers].sort((a, b) => a - b);
      const lowest = sortedNumbers[0];
      const highest = sortedNumbers[2];
      const extremes = [lowest, highest];


      return extremes.map((number, index) => (
        <button
          key={index}
          onClick={() => handleAnswerSelect(index)}
          disabled={isSubmitting}
          className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg sm:rounded-xl font-bold text-base sm:text-lg md:text-xl transition-all duration-100 ${
            selectedAnswer === index
              ? "bg-gradient-to-br from-orange-600 to-red-600 text-white shadow-2xl transform scale-105 ring-2 sm:ring-4 ring-orange-200/50"
              : "bg-card border-2 border-border text-foreground hover:border-orange-300 hover:bg-orange-50 shadow-lg hover:shadow-xl"
          } disabled:opacity-50 disabled:cursor-not-allowed font-mono`}
        >
          {number}
        </button>
      ));
    }

    // Check if question has visual rotation items
    if (question.data.visualRotationItems) {
      const items = question.data.visualRotationItems;
      const numPairs = Math.floor(items.length / 2);
      const maxOptions = Math.min(numPairs, 4); // Cap at 4 for UI reasons
      const options = Array.from({ length: maxOptions + 1 }, (_, i) => i); // 0 to maxOptions

      return options.map((option) => (
        <button
          key={option}
          onClick={() => handleAnswerSelect(option)}
          disabled={isSubmitting}
          className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-lg sm:rounded-xl font-bold text-lg sm:text-xl md:text-2xl transition-all duration-100 ${
            selectedAnswer === option
              ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-2xl transform scale-105 sm:scale-110 ring-2 sm:ring-4 ring-indigo-200/50"
              : "bg-card border-2 border-border text-foreground hover:border-indigo-300 hover:bg-indigo-50 shadow-lg hover:shadow-xl"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {option}
        </button>
      ));
    }

    // Default numeric options (for Pattern Recognition, etc.)

    return [0, 1, 2, 3, 4].map((option) => (
      <button
        key={option}
        onClick={() => handleAnswerSelect(option)}
        disabled={isSubmitting}
        className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-lg sm:rounded-xl font-bold text-lg sm:text-xl md:text-2xl transition-all duration-100 ${
          selectedAnswer === option
            ? "bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-2xl transform scale-105 sm:scale-110 ring-2 sm:ring-4 ring-blue-200/50"
            : "bg-card border-2 border-border text-foreground hover:border-blue-300 hover:bg-blue-50 shadow-lg hover:shadow-xl"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {option}
      </button>
    ));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
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
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            Assessment Error
          </h3>
          <p className="text-muted-foreground mb-4">Failed to load assessment</p>
          <button
            onClick={onBack}
            className="bg-gray-600 text-white px-6 py-3 rounded-xl hover:bg-gray-700 transition-colors"
          >
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
  const progress = ((currentQuestionIndex + 1) / exam.questions.length) * 100;

  return (
    <div className="min-h-screen bg-background">
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
                    className="bg-gradient-to-r from-blue-500 to-purple-600 h-1.5 rounded-full transition-all duration-100"
                  />
                </div>
                <span className="text-xs text-muted-foreground min-w-[30px]">
                  {Math.round(progress)}%
                </span>
                {/* Mobile Question Dots - Limited */}
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
                            ? "bg-blue-500"
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
                    className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-100"
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
                          ? "bg-blue-500"
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
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.1 }}
                className="mb-3 sm:mb-4 md:mb-6"
              >
                <div className="inline-flex items-center px-2 sm:px-3 py-1 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full mb-2 sm:mb-4">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mr-2 sm:mr-3"></div>
                  <span className="text-xs sm:text-sm font-medium text-foreground">
                    Question {currentQuestionIndex + 1} of{" "}
                    {exam.questions.length}
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
              {renderAnswerOptions(currentQuestion)}
            </motion.div>

            {/* Continue Button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.1 }}
              className="text-center px-4"
            >
              <button
                onClick={handleContinue}
                disabled={selectedAnswer === null || isSubmitting}
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 sm:px-8 sm:py-3 md:px-12 md:py-4 rounded-xl sm:rounded-2xl hover:from-blue-700 hover:to-purple-700 transition-all duration-100 font-semibold text-sm sm:text-base md:text-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-xl min-w-[140px] sm:min-w-[180px] md:min-w-[200px]"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center">
                    <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    <span className="text-xs sm:text-sm md:text-base">
                      Submitting...
                    </span>
                  </div>
                ) : currentQuestionIndex + 1 >= exam.questions.length ? (
                  "Complete Assessment"
                ) : (
                  "Continue"
                )}
              </button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
