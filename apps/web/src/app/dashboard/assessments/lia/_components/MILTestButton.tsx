"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { clearAllMILTestData, populateMILTestData } from "@/utils/milTestUtils";

export default function MILTestButton() {
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const handleClearData = async () => {
    setLoading(true);
    try {
      clearAllMILTestData();
      alert(t('dev.mil.cleared'));
      window.location.reload();
    } catch (error) {
      alert(t('dev.mil.clearFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePopulateData = async () => {
    setLoading(true);
    try {
      populateMILTestData();
      alert(t('dev.mil.populated'));
      window.location.reload();
    } catch (error) {
      alert(t('dev.mil.populateFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <div className="bg-yellow-500/10 dark:bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4 mb-6">
      <div className="flex items-center mb-3">
        <svg
          className="w-5 h-5 text-yellow-600 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <h3 className="text-sm font-medium text-yellow-800">{t('dev.mil.title')}</h3>
      </div>
      <p className="text-sm text-yellow-700 mb-3">{t('dev.mil.description')}</p>
      <div className="flex space-x-3">
        <button
          onClick={handlePopulateData}
          disabled={loading}
          className="bg-[#102B47] text-white px-3 py-1.5 rounded text-sm hover:bg-[#0b1f33] transition-colors disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('dev.mil.populateButton')}
        </button>
        <button
          onClick={handleClearData}
          disabled={loading}
          className="bg-red-600 text-white px-3 py-1.5 rounded text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {loading ? t('common.loading') : t('dev.mil.clearButton')}
        </button>
      </div>
      <div className="mt-3 text-xs text-yellow-600">
        <p>• Populate: Creates mock MIL sessions and progress data</p>
        <p>• Clear: Removes all MIL data from localStorage</p>
        <p>• Console: Use `milTestUtils` object for more functions</p>
      </div>
    </div>
  );
}
