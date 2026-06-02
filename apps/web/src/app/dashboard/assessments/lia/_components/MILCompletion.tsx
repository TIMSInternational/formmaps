"use client";

import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useMILData } from "@/hooks/useMILData";

interface MILCompletionProps {
  onViewResults: () => void;
  onReturnToDashboard: () => void;
}

export default function MILCompletion({
  onViewResults,
  onReturnToDashboard,
}: MILCompletionProps) {
  const { t } = useTranslation();
  const { progress, getOverallScore } = useMILData();

  const overallScore = getOverallScore();
  const completedCount = progress?.completedExams.length || 0;
  const totalCount = progress?.totalExams || 5;

  const getScoreMessage = (score: number) => {
    if (score >= 90)
      return {
        title: t("dashboard.outstanding"),
        message: t("dashboard.exceptionalPerformance"),
        color: "text-green-600",
      };
    if (score >= 80)
      return {
        title: t("dashboard.excellent"),
        message: t("dashboard.strongAbilities"),
        color: "text-blue-600",
      };
    if (score >= 70)
      return {
        title: t("dashboard.goodWork"),
        message: t("dashboard.solidPerformance"),
        color: "text-purple-600",
      };
    if (score >= 60)
      return {
        title: t("dashboard.wellDone"),
        message: t("dashboard.developingSkills"),
        color: "text-yellow-600",
      };
    return {
      title: t("dashboard.milComplete"),
      message: t("dashboard.assessmentFinished"),
      color: "text-muted-foreground",
    };
  };

  const scoreInfo = getScoreMessage(overallScore);

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="bg-card rounded-lg shadow-lg border p-8 text-center"
        >
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <svg
              className="w-12 h-12 text-green-600"
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

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`text-3xl font-bold mb-2 ${scoreInfo.color}`}
          >
            {scoreInfo.title}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-lg text-muted-foreground mb-8"
          >
            You have completed the LIA Assessment
          </motion.p>

          {/* Score Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-secondary rounded-lg p-6 mb-8"
          >
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {overallScore}%
                </div>
                <div className="text-sm text-muted-foreground">Overall Score</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {completedCount}
                </div>
                <div className="text-sm text-muted-foreground">Subtests Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  N/A
                </div>
                <div className="text-sm text-muted-foreground">Percentile Rank</div>
              </div>
            </div>
          </motion.div>

          {/* Key Insights */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-left mb-8"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Key Insights
            </h3>
            <div className="space-y-3">
              <div className="flex items-start">
                <div className="w-2 h-2 bg-purple-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <p className="text-foreground">
                  <strong>Pattern Recognition:</strong> Strong ability to
                  identify logical sequences and relationships
                </p>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <p className="text-foreground">
                  <strong>Cognitive Processing:</strong>{" "}
                  {scoreInfo.message.toLowerCase()}
                </p>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-green-600 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <p className="text-foreground">
                  <strong>Problem Solving:</strong> Demonstrates systematic
                  approach to complex tasks
                </p>
              </div>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <button
              onClick={onViewResults}
              className="flex-1 bg-purple-600 text-white py-3 px-6 rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              View Detailed Results
            </button>
            <button
              onClick={onReturnToDashboard}
              className="flex-1 bg-gray-600 text-white py-3 px-6 rounded-lg hover:bg-gray-700 transition-colors font-medium"
            >
              Return to Dashboard
            </button>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-8 pt-6 border-t border-border"
          >
            <p className="text-sm text-muted-foreground">
              Your results have been saved and are available on your dashboard.
              <br />
              Assessment completed on {new Date().toLocaleDateString()}
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
