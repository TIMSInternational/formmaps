"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  MILExamMetadata,
  getMILExamInstructions,
  MIL_EXAMS,
} from "@/services/milService";
import MILPracticeExamples from "./MILPracticeExamples";

interface MILInstructionsProps {
  exam: MILExamMetadata;
  onStart: () => void;
  onBack: () => void;
}

export default function MILInstructions({
  exam,
  onStart,
  onBack,
}: MILInstructionsProps) {
  const [showPractice, setShowPractice] = useState(false);
  const [instructions, setInstructions] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInstructions();
  }, [exam.id]);

  const loadInstructions = async () => {
    try {
      setLoading(true);
      const data = await getMILExamInstructions(exam.id as any);
      setInstructions(data);
    } catch (error) {
      console.error("Failed to load instructions:", error);
    } finally {
      setLoading(false);
    }
  };

  const getExamIcon = () => {
    const iconProps = {
      className: "w-8 h-8",
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24",
    };

    switch (exam.id) {
      case MIL_EXAMS.FEATURE_DETECTION:
        return (
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <svg {...iconProps} className="text-blue-600">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
          </div>
        );
      case MIL_EXAMS.VERBAL_REASONING:
        return (
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg {...iconProps} className="text-green-600">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
            <svg {...iconProps} className="text-gray-600">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
        );
    }
  };

  const getInstructionContent = () => {
    if (exam.id === MIL_EXAMS.FEATURE_DETECTION) {
      return (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              🎯 Objective of This Subtest
            </h3>
            <p className="text-blue-800">
              The Feature Detection subtest evaluates your ability to quickly and accurately identify relevant patterns and match information.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              📝 How the Test Works
            </h3>
            <ul className="list-disc pl-5 space-y-2 text-gray-700 mb-4">
              <li>You will see four pairs of letters arranged vertically in each question.</li>
              <li>Your task is to check how many pairs match (e.g., uppercase vs. lowercase versions of the same letter).</li>
              <li>Carefully review each block and count how many pairs are identical.</li>
            </ul>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-gray-700">{exam.description}</p>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-900">Time Limit:</span>
              <span className="text-gray-600 ml-2">
                {exam.timeLimitMinutes} minutes
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-900">Questions:</span>
              <span className="text-gray-600 ml-2">
                {exam.totalQuestions} items
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (showPractice) {
    return (
      <MILPracticeExamples
        examId={exam.id as any}
        onComplete={onStart}
        onBack={() => setShowPractice(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white shadow-sm border-b px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {exam.name}
              </h1>
              <p className="text-sm text-gray-600">Instructions & Examples</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-blue-600">
                {exam.timeLimitMinutes} minutes
              </div>
              <div className="text-sm text-gray-500">
                {exam.totalQuestions} questions
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-lg shadow-sm border p-6"
          >
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-red-900 mb-2">
                ⏱️ Speed Challenge:
              </h3>
              <p className="text-red-800 font-medium">
                You have <strong>{exam.timeLimitMinutes} minutes</strong> for{" "}
                <strong>{exam.totalQuestions} questions</strong>
              </p>
              <p className="text-red-700 text-sm mt-2">
                That's only{" "}
                <strong>
                  {Math.round(
                    (exam.timeLimitMinutes * 60) / exam.totalQuestions
                  )}{" "}
                  seconds per question
                </strong>
                ! Work quickly and trust your first instinct.
              </p>
            </div>

            <div className="mb-8">
              {loading ? (
                <div className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-gray-600">Loading instructions...</p>
                </div>
              ) : (
                getInstructionContent()
              )}
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
              <h4 className="font-medium text-yellow-900 mb-2">Important:</h4>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>• You cannot go back to previous questions</li>
                <li>• Each answer is automatically saved when you continue</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row justify-between gap-4 mt-8">
              <button
                onClick={onBack}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Back to Test List
              </button>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowPractice(true)}
                  className="px-6 py-3 bg-blue-100 text-blue-700 rounded-lg font-medium hover:bg-blue-200 transition-colors"
                >
                  Practice First
                </button>
                <button
                  onClick={onStart}
                  className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Start Test
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
