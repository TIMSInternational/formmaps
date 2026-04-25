"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  testPCAAPIStructure,
  testPCAAPIWithRealUser,
} from "../../utils/testPCAAPI";
import { useGlobalStore } from "../../store/useGlobalStore";

export default function TestPCAPage() {
  const { user } = useGlobalStore();
  const [testResults, setTestResults] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  const runStructureTest = async () => {
    setIsLoading(true);
    setTestResults("Running PCA API structure test...\n");

    // Capture console logs
    const originalLog = console.log;
    const originalError = console.error;
    const logs: string[] = [];

    console.log = (...args) => {
      logs.push(
        args
          .map((arg) =>
            typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
          )
          .join(" ")
      );
      originalLog(...args);
    };

    console.error = (...args) => {
      logs.push(
        "ERROR: " +
          args
            .map((arg) =>
              typeof arg === "object"
                ? JSON.stringify(arg, null, 2)
                : String(arg)
            )
            .join(" ")
      );
      originalError(...args);
    };

    try {
      await testPCAAPIStructure();
    } catch (error) {
      logs.push("Test failed: " + String(error));
    }

    // Restore console
    console.log = originalLog;
    console.error = originalError;

    setTestResults(logs.join("\n"));
    setIsLoading(false);
  };

  const runUserTest = async () => {
    if (!user?.id) {
      setTestResults("No user logged in. Please log in first.");
      return;
    }

    setIsLoading(true);
    setTestResults(`Running PCA API test with user: ${user.id}\n`);

    // Capture console logs
    const originalLog = console.log;
    const originalError = console.error;
    const logs: string[] = [];

    console.log = (...args) => {
      logs.push(
        args
          .map((arg) =>
            typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
          )
          .join(" ")
      );
      originalLog(...args);
    };

    console.error = (...args) => {
      logs.push(
        "ERROR: " +
          args
            .map((arg) =>
              typeof arg === "object"
                ? JSON.stringify(arg, null, 2)
                : String(arg)
            )
            .join(" ")
      );
      originalError(...args);
    };

    try {
      await testPCAAPIWithRealUser(user.id);
    } catch (error) {
      logs.push("Test failed: " + String(error));
    }

    // Restore console
    console.log = originalLog;
    console.error = originalError;

    setTestResults(logs.join("\n"));
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            {t("testPCA.title")}
          </h1>

          <div className="space-y-4 mb-6">
            <button
              onClick={runStructureTest}
              disabled={isLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? t("testPCA.testing") : t("testPCA.testStructure")}
            </button>

            <button
              onClick={runUserTest}
              disabled={isLoading || !user?.id}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 ml-4"
            >
              {isLoading
                ? t("testPCA.testing")
                : t("testPCA.testWithUser", {
                    id: user?.id ?? t("testPCA.notLoggedIn"),
                  })}
            </button>
          </div>

          {user?.id && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                {t("testPCA.currentUser")}:{" "}
                <code className="bg-blue-100 px-1 rounded">{user.id}</code>
              </p>
            </div>
          )}

          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-auto max-h-96">
            <pre className="whitespace-pre-wrap">
              {testResults || t("testPCA.clickToRun")}
            </pre>
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              {t("testPCA.endpointsTitle")}
            </h2>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>
                • <code>GET /api/pcaapi/evaluations</code> - Get all PCA
                evaluations
              </li>
              <li>
                • <code>POST /api/pcaapi/get-result</code> - Get PCA result by
                UserId
              </li>
              <li>
                • <code>checkPCAStatus()</code> - Custom function to determine
                status
              </li>
            </ul>
          </div>

          <div className="mt-4">
            <a
              href="/dashboard"
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              ← {t("common.backToDashboard")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
