"use client";

import { motion } from "motion/react";
import { MILExamMetadata } from "@/services/milService";

interface MILSubtestCompletionProps {
  completedExam: MILExamMetadata;
  currentIndex: number;
  totalExams: number;
  onContinue: () => void;
  onReturnToDashboard: () => void;
}

export default function MILSubtestCompletion({
  completedExam,
  currentIndex,
  totalExams,
  onContinue,
  onReturnToDashboard,
}: MILSubtestCompletionProps) {
  const isLastSubtest = currentIndex >= totalExams - 1;
  const completedCount = currentIndex + 1;
  const progressPercentage = (completedCount / totalExams) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl shadow-xl border p-6 sm:p-8 text-center max-w-md w-full"
      >
        {/* Success Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3, type: "spring" }}
          className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <svg
            className="w-10 h-10 text-green-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </motion.div>

        {/* Completion Message */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.2 }}
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Subtest Complete!
          </h2>
          <p className="text-gray-600 mb-6">
            You have successfully completed{" "}
            <strong>{completedExam.name}</strong>
          </p>
        </motion.div>

        {/* Progress Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.2 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Overall Progress
            </span>
            <span className="text-sm text-gray-600">
              {completedCount} of {totalExams} subtests completed
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="bg-gradient-to-r from-green-500 to-blue-500 h-3 rounded-full"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {Math.round(progressPercentage)}% complete
          </p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.2 }}
          className="space-y-3"
        >
          {!isLastSubtest ? (
            <>
              <button
                onClick={onContinue}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-semibold shadow-lg"
              >
                Continue to Next Subtest →
              </button>
              <button
                onClick={onReturnToDashboard}
                className="w-full bg-gray-100 text-gray-700 py-3 px-6 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium"
              >
                Return to Dashboard
              </button>
            </>
          ) : (
            <button
              onClick={onContinue}
              className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white py-3 px-6 rounded-lg hover:from-green-700 hover:to-blue-700 transition-all duration-200 font-semibold shadow-lg"
            >
              View Final Results →
            </button>
          )}
        </motion.div>

        {/* Encouragement Message */}
        {!isLastSubtest && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.2 }}
            className="text-xs text-gray-500 mt-4"
          >
            Take a moment to rest before continuing to the next subtest
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}
