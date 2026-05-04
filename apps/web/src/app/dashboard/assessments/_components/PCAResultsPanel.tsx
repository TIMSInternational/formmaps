import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  getPCAResult,
  getPCACompetences,
  getPCAVsJCAAnalysis,
  JCA_CODES,
  JCACode,
} from "@/services/pcaService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ModalSkeleton } from "@/components/ui/skeletons";

interface PCAResultsPanelProps {
  pcaCod: string;
  userId: string;
  onClose: () => void;
}

export default function PCAResultsPanel({
  pcaCod,
  userId,
  onClose,
}: PCAResultsPanelProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [competences, setCompetences] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [selectedJCA, setSelectedJCA] = useState<JCACode>("GTCML");
  const [activeTab, setActiveTab] = useState<
    "results" | "competences" | "analysis"
  >("results");

  useEffect(() => {
    switch (activeTab) {
      case "results":
        if (!results && !loading) loadResults();
        break;
      case "competences":
        if (!competences && !loading) loadCompetences();
        break;
      case "analysis":
        if (!analysis && !loading) loadAnalysis();
        break;
    }
  }, [activeTab]);

  const loadResults = async () => {
    setLoading(true);
    try {
      const data = await getPCAResult(userId);
      setResults(data);
    } catch (error) {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  const loadCompetences = async () => {
    setLoading(true);
    try {
      const data = await getPCACompetences(userId, "1"); // TIMS format
      setCompetences(data);
    } catch (error) {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  const loadAnalysis = async () => {
    setLoading(true);
    try {
      const analysisData = await getPCAVsJCAAnalysis(userId, selectedJCA, "g");
      setAnalysis(analysisData);
    } catch (error) {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  // Helper to safely access data properties handling case and structure variations
  const getVal = (obj: any, key: string) => {
    if (!obj) return null;
    const data = obj.data || obj;
    // Try explicit key, then PascalCase, then lowercase
    const exact = data[key];
    if (exact !== undefined) return exact;
    const pascal = data[key.charAt(0).toUpperCase() + key.slice(1)];
    if (pascal !== undefined) return pascal;
    const lower = data[key.toLowerCase()];
    if (lower !== undefined) return lower;
    return null;
  };

  const getPercentage = (obj: any, key: string) => {
    const val = getVal(obj, key);
    return typeof val === 'number' ? val : 0;
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 border-b shrink-0">
          <DialogTitle className="text-xl font-bold">
            PCA Results - {pcaCod.slice(0, 8)}...
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="border-b shrink-0 bg-white z-10">
          <nav className="flex space-x-8 px-6">
            {[
              { id: "results", label: t("dashboard.results") },
              { id: "competences", label: t("dashboard.competences") },
              { id: "analysis", label: t("dashboard.jcaAnalysis") },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as "results" | "competences" | "analysis")}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
          {loading && <ModalSkeleton />}

          {/* Results Tab */}
          {activeTab === "results" && !loading && (
            <div>
              {results ? (
                <div className="space-y-6">
                  {/* Personal Information */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Personal Information
                    </h3>
                    <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                      <div className="flex justify-between border-b border-gray-50 pb-2">
                        <span className="text-gray-500">Name:</span>
                        <span className="font-medium text-gray-900">
                          {getVal(results, "perNom")} {getVal(results, "perApe")}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-gray-50 pb-2">
                        <span className="text-gray-500">ID:</span>
                        <span className="font-medium text-gray-900">
                          {getVal(results, "perNumIde")}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-gray-50 pb-2">
                        <span className="text-gray-500">Gender:</span>
                        <span className="font-medium text-gray-900">
                          {getVal(results, "perGen") === "M" ? "Male" : "Female"}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-gray-50 pb-2">
                        <span className="text-gray-500">Email:</span>
                        <span className="font-medium text-gray-900">
                          {getVal(results, "perMail") || getVal(results, "perEmail")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* DISC Profile Scores */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      DISC Profile Scores
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Primary Scores */}
                      <div>
                        <h4 className="font-medium text-gray-700 mb-4 border-b pb-2">
                          Primary Dimensions
                        </h4>
                        <div className="space-y-4">
                          {[
                            { label: "Dominance (D)", val: getPercentage(results, "pcaD1"), color: "bg-red-500", text: "text-red-600" },
                            { label: "Influence (I)", val: getPercentage(results, "pcaI1"), color: "bg-yellow-500", text: "text-yellow-600" },
                            { label: "Steadiness (S)", val: getPercentage(results, "pcaS1"), color: "bg-green-500", text: "text-green-600" },
                            { label: "Conscientiousness (C)", val: getPercentage(results, "pcaC1"), color: "bg-blue-500", text: "text-blue-600" }
                          ].map((item, idx) => (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className={`font-medium ${item.text}`}>{item.label}</span>
                                <span className="font-bold">{item.val}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                <div
                                  className={`h-2.5 rounded-full transition-all duration-1000 ease-out ${item.color}`}
                                  style={{ width: `${item.val}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Secondary Scores */}
                      <div>
                        <h4 className="font-medium text-gray-700 mb-4 border-b pb-2">
                          Secondary Dimensions
                        </h4>
                        <div className="space-y-4">
                          {[
                            { label: "Dominance 2 (D2)", val: getPercentage(results, "pcaD2"), color: "bg-red-400/80", text: "text-red-500" },
                            { label: "Influence 2 (I2)", val: getPercentage(results, "pcaI2"), color: "bg-yellow-400/80", text: "text-yellow-500" },
                            { label: "Steadiness 2 (S2)", val: getPercentage(results, "pcaS2"), color: "bg-green-400/80", text: "text-green-500" },
                            { label: "Conscientiousness 2 (C2)", val: getPercentage(results, "pcaC2"), color: "bg-blue-400/80", text: "text-blue-500" }
                          ].map((item, idx) => (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className={`font-medium ${item.text}`}>{item.label}</span>
                                <span className="font-bold">{item.val}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                <div
                                  className={`h-2.5 rounded-full transition-all duration-1000 ease-out ${item.color}`}
                                  style={{ width: `${item.val}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Graph 3: Self-Image */}
                    <div className="mt-6">
                      <h4 className="font-medium text-gray-700 mb-4 border-b pb-2">
                        Self-Image
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        {[
                          { label: "Dominance 3 (D3)", val: getPercentage(results, "pcaD3"), color: "bg-red-500/70", text: "text-red-500" },
                          { label: "Influence 3 (I3)", val: getPercentage(results, "pcaI3"), color: "bg-yellow-500/70", text: "text-yellow-500" },
                          { label: "Steadiness 3 (S3)", val: getPercentage(results, "pcaS3"), color: "bg-green-500/70", text: "text-green-500" },
                          { label: "Conscientiousness 3 (C3)", val: getPercentage(results, "pcaC3"), color: "bg-blue-500/70", text: "text-blue-500" }
                        ].map((item, idx) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className={`font-medium ${item.text}`}>{item.label}</span>
                              <span className="font-bold">{item.val}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                              <div
                                className={`h-2.5 rounded-full transition-all duration-1000 ease-out ${item.color}`}
                                style={{ width: `${item.val}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* PCA Report Image */}
                  {getVal(results, "pcaImg") && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        DISC Profile Graph
                      </h3>
                      <div style={{ textAlign: "center" }}>
                        <img
                          src={getVal(results, "pcaImg")}
                          alt="DISC Profile Graph"
                          style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e5e7eb" }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Assessment Details */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Report Links
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <a
                        href={getVal(results, "pcaLink")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center px-4 py-3 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors font-medium border border-blue-100"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Full PDF Report
                      </a>

                      {getVal(results, "pcaImg") && (
                        <a
                          href={getVal(results, "pcaImg")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 inline-flex items-center justify-center px-4 py-3 bg-purple-50 text-purple-700 rounded-xl hover:bg-purple-100 transition-colors font-medium border border-purple-100"
                        >
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Visual Report Image
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Initializing results data...</p>
                </div>
              )}
            </div>
          )}

          {/* Competences Tab */}
          {activeTab === "competences" && !loading && (
            <div>
              {competences ? (
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl overflow-x-auto text-xs font-mono">
                  {JSON.stringify(competences, null, 2)}
                </pre>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500">No competence data available.</p>
                </div>
              )}
            </div>
          )}

          {/* Analysis Tab */}
          {activeTab === "analysis" && !loading && (
            <div>
              <div className="mb-6 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Compared against Job Competency Analysis (JCA):
                </label>
                <select
                  value={selectedJCA}
                  onChange={(e) => {
                    setSelectedJCA(e.target.value as JCACode);
                    setAnalysis(null); // Reset analysis when JCA changes
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {Object.entries(JCA_CODES).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {analysis ? (
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl overflow-x-auto text-xs font-mono">
                  {JSON.stringify(analysis, null, 2)}
                </pre>
              ) : (
                <div className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Analysing data against JCA...</p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
