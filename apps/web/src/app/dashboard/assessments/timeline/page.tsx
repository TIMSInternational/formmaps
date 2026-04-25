"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Calendar, History, Clock } from "lucide-react";

export default function AssessmentTimelinePage() {
  const { t } = useTranslation();

  return (
    <main className="flex-1 overflow-y-auto bg-gray-50/50 p-6">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <h1 className="text-3xl font-bold text-gray-900">
                Assessment Timeline
              </h1>
              <p className="text-gray-600 mt-2">
                View your assessment history and upcoming schedule.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center"
            >
              <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <History className="w-8 h-8 text-purple-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Assessment History
              </h2>
              <p className="text-gray-500 max-w-md mx-auto">
                Your assessment timeline and history will appear here once you complete your first assessment.
              </p>
            </motion.div>
          </div>
    </main>
  );
}
