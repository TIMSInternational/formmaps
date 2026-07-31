"use client";

import { useState } from 'react';
import { CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import {
  LIAQuestion,
  LIASubtest,
  SUBTEST_CONFIG,
  PatternRecognitionData,
  VerbalReasoningData,
  NumericalSpeedData,
  WorkingMemoryData,
  VisualRotationData,
} from '@/services/liaService';
import {
  PatternRecognitionItem,
  VerbalReasoningItem,
  NumericalSpeedItem,
  WorkingMemoryItem,
  VisualRotationItem,
} from './subtests';

interface LIAPracticeProps {
  subtest: LIASubtest;
  questions: LIAQuestion[];
  onComplete: () => void;
  onSubmitAnswer: (questionId: string, answer: string) => Promise<{
    is_correct: boolean;
    correct_answer: string;
    practice_complete: boolean;
    error?: boolean;
  }>;
  language?: 'es' | 'en';
}

export function LIAPractice({
  subtest,
  questions,
  onComplete,
  onSubmitAnswer,
  language = 'es',
}: LIAPracticeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    correctAnswer: string;
    error?: boolean;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [practiceComplete, setPracticeComplete] = useState(false);

  const currentQuestion = questions[currentIndex];
  const config = SUBTEST_CONFIG[subtest];
  const subtestName = config.displayName[language];

  const handleAnswer = async (answer: string) => {
    if (isSubmitting || feedback) return;

    setIsSubmitting(true);
    try {
      const result = await onSubmitAnswer(currentQuestion.id, answer);
      setFeedback({
        isCorrect: result.is_correct,
        correctAnswer: result.correct_answer,
        error: result.error,
      });

      if (result.practice_complete) {
        setPracticeComplete(true);
      }
    } catch {
      // Honest error state — never present a fabricated "correct answer".
      setFeedback({ isCorrect: false, correctAnswer: '', error: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (practiceComplete) {
      onComplete();
    } else {
      if (feedback?.isCorrect) {
        setCurrentIndex(currentIndex + 1);
      }
      setFeedback(null);
    }
  };

  const handleRetry = () => {
    setFeedback(null);
  };

  const renderQuestion = () => {
    const data = currentQuestion.question_data;

    switch (subtest) {
      case 'pattern_recognition':
        return (
          <PatternRecognitionItem
            data={data as PatternRecognitionData}
            onAnswer={handleAnswer}
            disabled={isSubmitting || !!feedback}
          />
        );
      case 'verbal_reasoning':
        return (
          <VerbalReasoningItem
            data={data as VerbalReasoningData}
            onAnswer={handleAnswer}
            disabled={isSubmitting || !!feedback}
          />
        );
      case 'numerical_speed':
        return (
          <NumericalSpeedItem
            data={data as NumericalSpeedData}
            onAnswer={handleAnswer}
            disabled={isSubmitting || !!feedback}
          />
        );
      case 'working_memory':
        return (
          <WorkingMemoryItem
            data={data as WorkingMemoryData}
            onAnswer={handleAnswer}
            disabled={isSubmitting || !!feedback}
          />
        );
      case 'visual_rotation':
        return (
          <VisualRotationItem
            data={data as VisualRotationData}
            onAnswer={handleAnswer}
            disabled={isSubmitting || !!feedback}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-40px)]">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-[40px] z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-xs font-medium text-[#102B47] bg-[#102B47]/10 px-2 py-1 rounded">
                {language === 'es' ? 'PRÁCTICA' : 'PRACTICE'}
              </span>
              <h2 className="text-lg font-semibold text-gray-900 mt-1">
                {subtestName}
              </h2>
              <p className="text-sm text-gray-500">
                {language === 'es'
                  ? `Pregunta ${currentIndex + 1} de ${questions.length}`
                  : `Question ${currentIndex + 1} of ${questions.length}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {questions.map((_, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                    i < currentIndex
                      ? 'bg-green-500 text-white'
                      : i === currentIndex
                      ? 'bg-[#102B47] text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {i < currentIndex ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#102B47] transition-all duration-500"
              style={{ width: `${(currentIndex / questions.length) * 100}%` }}
            />
          </div>
        </div>
      </header>

      {/* Question content */}
      <main className="flex-1 max-w-3xl mx-auto px-4 py-8 w-full">
        <div className="bg-white rounded-xl shadow-sm p-8">
          {!practiceComplete ? (
            renderQuestion()
          ) : (
            <div className="text-center space-y-4 py-8">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <h3 className="text-xl font-bold text-gray-900">
                {language === 'es' ? '¡Práctica Completada!' : 'Practice Complete!'}
              </h3>
              <p className="text-gray-600">
                {language === 'es'
                  ? 'Estás listo para comenzar la sección cronometrada.'
                  : "You're ready to start the timed section."}
              </p>
              <button
                onClick={onComplete}
                className="mt-4 py-3 px-8 bg-[#102B47] hover:bg-[#0b1f33] text-white font-medium rounded-lg flex items-center justify-center gap-2 mx-auto transition-colors"
              >
                {language === 'es' ? 'Comenzar Sección' : 'Start Section'}
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Info text */}
        {!practiceComplete && (
          <p className="text-center text-sm text-gray-500 mt-4">
            {language === 'es'
              ? 'Las preguntas de práctica no tienen límite de tiempo.'
              : 'Practice questions have no time limit.'}
          </p>
        )}
      </main>

      {/* Feedback overlay */}
      {feedback && !practiceComplete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-sm mx-4 shadow-xl">
            {feedback.isCorrect ? (
              <>
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-center text-gray-900 mb-2">
                  {language === 'es' ? '¡Correcto!' : 'Correct!'}
                </h3>
                <p className="text-center text-gray-600 mb-6 text-sm">
                  {language === 'es' ? 'Puedes continuar.' : 'You can continue.'}
                </p>
                <button
                  onClick={handleNext}
                  className="w-full py-3 px-6 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  {language === 'es' ? 'Continuar' : 'Continue'}
                  <ArrowRight className="w-5 h-5" />
                </button>
              </>
            ) : feedback.error ? (
              <>
                <XCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-center text-gray-900 mb-2">
                  {language === 'es' ? 'Hubo un problema' : 'Something went wrong'}
                </h3>
                <p className="text-center text-gray-600 mb-6 text-sm">
                  {language === 'es'
                    ? 'No pudimos verificar tu respuesta. Intenta de nuevo.'
                    : "We couldn't check your answer. Please try again."}
                </p>
                <button
                  onClick={handleRetry}
                  className="w-full py-3 px-6 bg-[#102B47] hover:bg-[#0b1f33] text-white font-medium rounded-lg transition-colors"
                >
                  {language === 'es' ? 'Intentar de nuevo' : 'Try again'}
                </button>
              </>
            ) : (
              <>
                <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-center text-gray-900 mb-2">
                  {language === 'es' ? 'Incorrecto' : 'Incorrect'}
                </h3>
                <p className="text-center text-gray-600 mb-2 text-sm">
                  {language === 'es' ? 'La respuesta correcta es:' : 'The correct answer is:'}
                </p>
                <p className="text-center text-xl font-bold text-[#102B47] mb-6">
                  {feedback.correctAnswer}
                </p>
                <button
                  onClick={handleRetry}
                  className="w-full py-3 px-6 bg-[#102B47] hover:bg-[#0b1f33] text-white font-medium rounded-lg transition-colors"
                >
                  {language === 'es' ? 'Intentar de nuevo' : 'Try again'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
