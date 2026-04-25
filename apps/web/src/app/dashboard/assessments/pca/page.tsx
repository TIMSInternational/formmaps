"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useGlobalStore } from "@/store/useGlobalStore";
import { usePCAData } from "@/hooks/usePCAData";
import {
  addPCAEvaluation,
  JCACode,
  JCA_CODES,
  JCA_CODES_ENGLISH,
} from "@/services/pcaService";
  import PCAResultsPanel from "../_components/PCAResultsPanel";
import { useSearchParams } from "next/navigation";

export default function PCAAssessmentPage() {
  const { user } = useGlobalStore();
  const { t } = useTranslation();
  const { pcaData, loading, error, refreshPCAData, hasPCA, isCompleted } =
    usePCAData();
  
  const searchParams = useSearchParams();

  const [selectedLanguage, setSelectedLanguage] = useState<
    "spanish" | "english"
  >("spanish");
  const [selectedJCA, setSelectedJCA] = useState<JCACode>("GTCML");
  const [isCreating, setIsCreating] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [assessmentUrl, setAssessmentUrl] = useState<string | null>(null);

  // Auto-show results if query param is present and data is loaded
  useEffect(() => {
    if (searchParams.get("showResults") === "true" && hasPCA && isCompleted && pcaData?.pcaCod) {
      setShowResults(true);
    }
  }, [searchParams, hasPCA, isCompleted, pcaData]);

  const handleStartAssessment = async () => {
    if (!user?.id || !user?.name || !user?.email) {
      alert(t("dashboard.pcaUserInfoIncomplete"));
      return;
    }

    setIsCreating(true);
    try {
      const userData = {
        PerNom: user.name.split(" ")[0] || "User",
        PerApe: user.name.split(" ").slice(1).join(" ") || "Name",
        PerNumIde: user.id.slice(-8), // Use last 8 chars of user ID
        PerGen: "M" as const, // Default to M, could be made configurable
        permail: user.email,
        JcaCod: selectedJCA,
        BillingCenter: "",
        UserMail: user.email,
      };

      // Use the new backend API integration
      const result = await addPCAEvaluation(
        user.id,
        userData,
        selectedLanguage
      );

      if (result.success && result.assessmentUrl) {
        // Set the assessment URL to render in iframe
        setAssessmentUrl(result.assessmentUrl);

        // Refresh PCA data to update status
        setTimeout(() => {
          refreshPCAData();
        }, 2000);
      } else {
        alert(`Failed to create assessment: ${result.message}`);
      }
    } catch (error) {
      alert("Failed to create assessment. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading PCA data...</p>
        </div>
      </div>
    );
  }

  // If assessment URL is available, render the iframe
  if (assessmentUrl) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header with back button */}
        <div className="bg-white shadow-sm border-b px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={() => {
                  setAssessmentUrl(null);
                }}
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors mr-4"
              >
                <svg
                  className="w-5 h-5 mr-1"
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
                <span className="text-sm">
                  {t("dashboard.backToConfiguration")}
                </span>
              </button>
              <h1 className="text-lg font-semibold text-gray-900">
                {t("dashboard.pcaTitle")}
              </h1>
            </div>
            <div className="text-sm text-gray-500">
              {t("dashboard.assessmentInProgress")}
            </div>
          </div>
        </div>

        {/* Iframe Container */}
        <div className="h-[calc(100vh-64px)]">
          <iframe
            src={assessmentUrl}
            className="w-full h-full border-0"
            title="PCA Assessment"
            allow="fullscreen"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="flex mb-6" aria-label="Breadcrumb">
          <ol className="inline-flex items-center space-x-1 md:space-x-3">
            <li className="inline-flex items-center">
              <a
                href="/dashboard"
                className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-blue-600"
              >
                {t("nav.dashboard")}
              </a>
            </li>
            <li>
              <div className="flex items-center">
                <svg
                  className="w-6 h-6 text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <a
                  href="/dashboard/assessments"
                  className="ml-1 text-sm font-medium text-gray-700 hover:text-blue-600 md:ml-2"
                >
                  {t("dashboard.assessments")}
                </a>
              </div>
            </li>
            <li>
              <div className="flex items-center">
                <svg
                  className="w-6 h-6 text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="ml-1 text-sm font-medium text-gray-500 md:ml-2">
                  PCA
                </span>
              </div>
            </li>
          </ol>
        </nav>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {t("dashboard.pcaTitle")}
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            {t("dashboard.pcaDescription")}
          </p>
        </motion.div>

        {/* Status Card */}
        {hasPCA && isCompleted && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8"
          >
            <div className="flex items-center lg:flex-row flex-col gap-3 ">
              <div className="bg-green-100 rounded-full p-2 mr-4">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1 mx-auto  text-center lg:text-left">
                <h3 className="text-lg font-semibold text-green-900">
                  {t("dashboard.assessmentCompleted")}
                </h3>
                <p className="text-green-700">
                  Your PCA assessment has been completed successfully.
                </p>
              </div>
              <button
                onClick={() => setShowResults(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                View Results
              </button>
            </div>
          </motion.div>
        )}

        {/* Assessment Configuration */}
        {(!hasPCA || !isCompleted) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-lg shadow-sm border p-6 mb-8"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              {t("dashboard.assessmentConfiguration")}
            </h2>
            {/* Language Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {t("dashboard.selectAssessmentLanguage")}
                <span className="text-xs text-gray-500 ml-2">
                  ({t("dashboard.current")}:{" "}
                  {selectedLanguage === "spanish"
                    ? t("language.spanish")
                    : t("language.english")}
                  )
                </span>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setSelectedLanguage("spanish");
                  }}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedLanguage === "spanish"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">🇪🇸</div>
                    <div className="font-medium">{t("language.spanish")}</div>
                    <div className="text-sm text-gray-500">
                      {t("dashboard.spanishAssessment")}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setSelectedLanguage("english");
                  }}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedLanguage === "english"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">🇺🇸</div>
                    <div className="font-medium">{t("language.english")}</div>
                    <div className="text-sm text-gray-500">
                      {t("dashboard.englishAssessment")}
                    </div>
                  </div>
                </button>
              </div>
            </div>
            {/* JCA Selection
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Job Competency Analysis (JCA)
              </label>
              <select
                value={selectedJCA}
                onChange={(e) => setSelectedJCA(e.target.value as JCACode)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Object.entries(
                  selectedLanguage === "english" ? JCA_CODES_ENGLISH : JCA_CODES
                ).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div> */}
            {/* Start Button */}
            <button
              onClick={handleStartAssessment}
              disabled={isCreating}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  {t("dashboard.creatingAssessment")}
                </div>
              ) : (
                t("dashboard.startPCA")
              )}
            </button>
          </motion.div>
        )}

        {/* Information Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-lg shadow-sm border p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t("dashboard.whatIsPCA")}
            </h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                {t("dashboard.pcaEvaluates")}
              </li>
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                {t("dashboard.pcaStrengths")}
              </li>
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                {t("dashboard.pcaJobMatching")}
              </li>
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                {t("dashboard.pcaLanguages")}
              </li>
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-lg shadow-sm border p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {t("dashboard.assessmentDetails")}
            </h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                {t("dashboard.pcaDuration")}
              </li>
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                {t("dashboard.pcaFormat")}
              </li>
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                {t("dashboard.pcaImmediateResults")}
              </li>
              <li className="flex items-start">
                <svg
                  className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                {t("dashboard.pcaSecurePlatform")}
              </li>
            </ul>
          </motion.div>
        </div>

        {/* Results Panel */}
        {showResults && pcaData?.pcaCod && (
          <PCAResultsPanel
            pcaCod={pcaData.pcaCod}
            onClose={() => setShowResults(false)}
          />
        )}
      </div>
    </div>
  );
}
