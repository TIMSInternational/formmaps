"use client";

import { useState, useEffect } from "react";
import { startMILExam, MILExam, MILQuestion } from "@/services/milService";

export default function VisualRotationReviewPage() {
  const [exam, setExam] = useState<MILExam | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAnswers, setSelectedAnswers] = useState<{
    [key: number]: number;
  }>({});

  useEffect(() => {
    loadExam();
  }, []);

  const loadExam = async () => {
    try {
      setLoading(true);
      const examData = await startMILExam("spatial-orientation-001");
      setExam(examData);
    } catch (error) {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (questionIndex: number, answer: number) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionIndex]: answer,
    }));
  };

  const renderVisualRotation = (
    question: MILQuestion,
    questionIndex: number
  ) => {
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

    const getTransform = (item: { rotationDegree: number; isMirrored: boolean }) => {
      let transform = "";

      if (item.rotationDegree !== 0) {
        transform += `rotate(${item.rotationDegree}deg)`;
      }

      if (item.isMirrored) {
        transform += " scaleX(-1)";
      }

      return transform || "none";
    };

    const numPairs = pairs.length;
    const maxOptions = Math.min(numPairs, 4);
    const options = Array.from({ length: maxOptions + 1 }, (_, i) => i);

    return (
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold text-foreground">
            Question {question.questionNumber}
          </h3>
          <div className="text-sm text-muted-foreground">
            Pairs: {numPairs} | Correct: {question.correctAnswer}
          </div>
        </div>

        <p className="text-foreground mb-6">{question.questionText}</p>

        {/* Visual Rotation Display */}
        <div className="max-w-2xl mx-auto mb-6">
          <div className="relative bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-200/60 rounded-xl p-6 shadow-xl backdrop-blur-sm">
            {/* Top Row */}
            <div
              className={`grid gap-4 mb-6`}
              style={{ gridTemplateColumns: `repeat(${pairs.length}, 1fr)` }}
            >
              {pairs.map((pair, index) => (
                <div key={`top-${index}`} className="text-center">
                  <div className="w-16 h-16 bg-card border-2 border-indigo-300 rounded-lg flex items-center justify-center shadow-sm">
                    <span
                      className="text-2xl font-bold text-foreground font-mono inline-block transition-transform duration-200"
                      style={{
                        transform: getTransform(pair.top),
                      }}
                    >
                      {pair.top.letter}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {pair.top.rotationDegree}° {pair.top.isMirrored ? "M" : ""}
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-indigo-300 to-transparent mb-6" />

            {/* Bottom Row */}
            <div
              className={`grid gap-4`}
              style={{ gridTemplateColumns: `repeat(${pairs.length}, 1fr)` }}
            >
              {pairs.map((pair, index) => (
                <div key={`bottom-${index}`} className="text-center">
                  <div className="w-16 h-16 bg-card border-2 border-indigo-300 rounded-lg flex items-center justify-center shadow-sm">
                    <span
                      className="text-2xl font-bold text-foreground font-mono inline-block transition-transform duration-200"
                      style={{
                        transform: getTransform(pair.bottom),
                      }}
                    >
                      {pair.bottom.letter}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {pair.bottom.rotationDegree}°{" "}
                    {pair.bottom.isMirrored ? "M" : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Answer Options */}
        <div className="flex justify-center gap-3 mb-4">
          {options.map((option) => (
            <button
              key={option}
              onClick={() => handleAnswerSelect(questionIndex, option)}
              className={`w-12 h-12 rounded-lg font-bold text-lg transition-all duration-100 ${
                selectedAnswers[questionIndex] === option
                  ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-xl transform scale-110 ring-4 ring-indigo-200/50"
                  : "bg-card border-2 border-border text-foreground hover:border-indigo-300 hover:bg-indigo-50 shadow-lg hover:shadow-xl"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {/* Explanation */}
        <div className="bg-secondary border border-border rounded-lg p-4">
          <h4 className="font-medium text-foreground mb-2">Explanation:</h4>
          <p className="text-foreground text-sm">{question.explanation}</p>

          {/* Show selected vs correct */}
          <div className="mt-3 flex gap-4 text-sm">
            <div
              className={`px-3 py-1 rounded ${
                selectedAnswers[questionIndex] !== undefined
                  ? selectedAnswers[questionIndex] ===
                    parseInt(question.correctAnswer as string)
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-600 dark:text-red-400"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              Your Answer: {selectedAnswers[questionIndex] ?? "Not selected"}
            </div>
            <div className="px-3 py-1 rounded bg-blue-100 text-blue-800">
              Correct Answer: {question.correctAnswer}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading visual rotation questions...</p>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center">
        <div className="text-center">
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
          <p className="text-muted-foreground">Failed to load visual rotation exam</p>
        </div>
      </div>
    );
  }

  const correctAnswers = exam.questions.filter(
    (_, index) =>
      selectedAnswers[index] ===
      parseInt(exam.questions[index].correctAnswer as string)
  ).length;

  const totalAnswered = Object.keys(selectedAnswers).length;

  return (
    <div className="min-h-screen bg-secondary">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Visual Rotation Assessment - Review Mode
          </h1>
          <p className="text-muted-foreground mb-4">
            All {exam.questions.length} questions from the visual rotation
            assessment. No timer, no restrictions - perfect for review and
            testing.
          </p>

          {/* Stats */}
          <div className="flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span>Total Questions: {exam.questions.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500/10 dark:bg-green-500/200 rounded-full"></div>
              <span>Answered: {totalAnswered}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <span>Correct: {correctAnswers}</span>
            </div>
            {totalAnswered > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                <span>
                  Accuracy: {Math.round((correctAnswers / totalAnswered) * 100)}
                  %
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-6">
          {exam.questions.map((question, index) => (
            <div key={question.questionNumber}>
              {renderVisualRotation(question, index)}
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="bg-card border border-border rounded-lg p-6 mt-8">
          <h2 className="text-xl font-semibold text-foreground mb-4">Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {exam.questions.length}
              </div>
              <div className="text-sm text-blue-800">Total Questions</div>
            </div>
            <div className="text-center p-4 bg-green-500/10 dark:bg-green-500/20 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {totalAnswered}
              </div>
              <div className="text-sm text-green-800">Answered</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {correctAnswers}
              </div>
              <div className="text-sm text-purple-600 dark:text-purple-400">Correct</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {totalAnswered > 0
                  ? Math.round((correctAnswers / totalAnswered) * 100)
                  : 0}
                %
              </div>
              <div className="text-sm text-orange-800">Accuracy</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
