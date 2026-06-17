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
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, unknown> | null>(null);
  const [competences, setCompetences] = useState<Record<string, unknown> | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
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
    // `loading` in deps: if a tab is selected while another load is in flight,
    // re-run once it settles so the new tab's data still loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loading]);

  const loadResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPCAResult(userId);
      setResults(data);
    } catch {
      setError("Failed to load results");
    } finally {
      setLoading(false);
    }
  };

  const loadCompetences = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPCACompetences(userId, "1"); // TIMS format
      setCompetences(data);
    } catch {
      setError("Failed to load competences");
    } finally {
      setLoading(false);
    }
  };

  const loadAnalysis = async (jca: JCACode = selectedJCA) => {
    setLoading(true);
    setError(null);
    try {
      const analysisData = await getPCAVsJCAAnalysis(userId, jca, "g");
      setAnalysis(analysisData);
    } catch {
      setError("Failed to load analysis");
    } finally {
      setLoading(false);
    }
  };

  // Helper to safely access data properties handling case and structure variations
  const getRaw = (obj: Record<string, unknown> | null, key: string): unknown => {
    if (!obj) return null;
    const data = (obj.data && typeof obj.data === "object" ? obj.data : obj) as Record<string, unknown>;
    // Try explicit key, then PascalCase, then lowercase
    const exact = data[key];
    if (exact !== undefined) return exact;
    const pascal = data[key.charAt(0).toUpperCase() + key.slice(1)];
    if (pascal !== undefined) return pascal;
    const lower = data[key.toLowerCase()];
    if (lower !== undefined) return lower;
    return null;
  };

  // String-safe version for rendering in JSX
  const getVal = (obj: Record<string, unknown> | null, key: string): string | null => {
    const v = getRaw(obj, key);
    if (v === null || v === undefined) return null;
    return String(v);
  };

  const getPercentage = (obj: Record<string, unknown> | null, key: string) => {
    const val = getRaw(obj, key);
    if (val === null || val === undefined) return null;
    const num = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(num) ? num : null;
  };

  // Validate that DISC scores are present and numeric
  const hasDISCScores = (obj: Record<string, unknown> | null): boolean => {
    const required = ["pcaD1", "pcaI1", "pcaS1", "pcaC1"];
    return required.every(key => getPercentage(obj, key) !== null);
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

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-red-400 mb-3" />
              <p className="text-gray-700 font-medium mb-1">{error}</p>
              <p className="text-gray-500 text-sm mb-4">Please try again or contact support if the issue persists.</p>
              <button
                onClick={() => {
                  setError(null);
                  if (activeTab === "results") loadResults();
                  else if (activeTab === "competences") loadCompetences();
                  else if (activeTab === "analysis") loadAnalysis();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          )}

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
                      <div className="flex justify-between gap-3 min-w-0 border-b border-gray-50 pb-2">
                        <span className="text-gray-500 shrink-0">Name:</span>
                        <span className="font-medium text-gray-900 text-right break-words min-w-0">
                          {getVal(results, "perNom")} {getVal(results, "perApe")}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 min-w-0 border-b border-gray-50 pb-2">
                        <span className="text-gray-500 shrink-0">ID:</span>
                        <span className="font-medium text-gray-900 text-right break-words min-w-0">
                          {getVal(results, "perNumIde")}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 min-w-0 border-b border-gray-50 pb-2">
                        <span className="text-gray-500 shrink-0">Gender:</span>
                        <span className="font-medium text-gray-900 text-right break-words min-w-0">
                          {getVal(results, "perGen") === "M" ? "Male" : "Female"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 min-w-0 border-b border-gray-50 pb-2">
                        <span className="text-gray-500 shrink-0">Email:</span>
                        <span className="font-medium text-gray-900 text-right break-all min-w-0">
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
                    {!hasDISCScores(results) ? (
                      <div className="flex items-center gap-3 py-8 justify-center text-gray-500">
                        <AlertCircle className="h-5 w-5" />
                        <span className="text-sm font-medium">Results not available — DISC scores are incomplete or still processing.</span>
                      </div>
                    ) : (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Primary Scores */}
                      <div>
                        <h4 className="font-medium text-gray-700 mb-4 border-b pb-2">
                          Primary Dimensions
                        </h4>
                        <div className="space-y-4">
                          {[
                            { label: "Dominance (D)", val: getPercentage(results, "pcaD1") ?? 0, color: "bg-red-500", text: "text-red-600" },
                            { label: "Influence (I)", val: getPercentage(results, "pcaI1") ?? 0, color: "bg-yellow-500", text: "text-yellow-600" },
                            { label: "Solidity (S)", val: getPercentage(results, "pcaS1") ?? 0, color: "bg-green-500", text: "text-green-600" },
                            { label: "Control (C)", val: getPercentage(results, "pcaC1") ?? 0, color: "bg-blue-500", text: "text-blue-600" }
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
                            { label: "Dominance 2 (D2)", val: getPercentage(results, "pcaD2") ?? 0, color: "bg-red-400/80", text: "text-red-500" },
                            { label: "Influence 2 (I2)", val: getPercentage(results, "pcaI2") ?? 0, color: "bg-yellow-400/80", text: "text-yellow-500" },
                            { label: "Solidity 2 (S2)", val: getPercentage(results, "pcaS2") ?? 0, color: "bg-green-400/80", text: "text-green-500" },
                            { label: "Control 2 (C2)", val: getPercentage(results, "pcaC2") ?? 0, color: "bg-blue-400/80", text: "text-blue-500" }
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
                          { label: "Dominance 3 (D3)", val: getPercentage(results, "pcaD3") ?? 0, color: "bg-red-500/70", text: "text-red-500" },
                          { label: "Influence 3 (I3)", val: getPercentage(results, "pcaI3") ?? 0, color: "bg-yellow-500/70", text: "text-yellow-500" },
                          { label: "Solidity 3 (S3)", val: getPercentage(results, "pcaS3") ?? 0, color: "bg-green-500/70", text: "text-green-500" },
                          { label: "Control 3 (C3)", val: getPercentage(results, "pcaC3") ?? 0, color: "bg-blue-500/70", text: "text-blue-500" }
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
                    </>
                    )}
                  </div>

                  {/* PCA Report Image */}
                  {getVal(results, "pcaImg") && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        DISC Profile Graph
                      </h3>
                      <div style={{ textAlign: "center" }}>
                        <img
                          src={getVal(results, "pcaImg") ?? undefined}
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
                        href={getVal(results, "pcaLink") ?? undefined}
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
                          href={getVal(results, "pcaImg") ?? undefined}
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
              {competences && Array.isArray(competences.pcaCmps) ? (
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Competency Levels</h3>
                  <div className="space-y-3">
                    {(competences.pcaCmps as Array<{ cmpNom?: string; level?: number }>).map((c, i) => {
                      const level = Math.max(0, Math.min(3, Number(c.level) || 0));
                      return (
                        <div key={i} className="flex items-center justify-between gap-4">
                          <span className="text-sm text-gray-700">{(c.cmpNom || "").trim()}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex gap-1">
                              {[1, 2, 3].map((n) => (
                                <span
                                  key={n}
                                  className="inline-block w-6 h-2 rounded-full"
                                  style={{ background: n <= level ? "#065292" : "#e5e7eb" }}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-gray-500 w-14 text-right">
                              {["—", "Low", "Medium", "High"][level]}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
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
                    const jca = e.target.value as JCACode;
                    setSelectedJCA(jca);
                    setAnalysis(null); // clear the old result…
                    loadAnalysis(jca); // …and immediately re-fetch for the new job (else it sticks on "Analysing…")
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
                // NOTE: deliberately do NOT render the raw payload — its repLink
                // embeds the vendor CoKey, which must never reach the client UI.
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm text-center">
                  <p className="text-sm text-gray-500 mb-2">
                    Competency match with {JCA_CODES[selectedJCA]}
                  </p>
                  <p className="text-5xl font-bold" style={{ color: "#065292" }}>
                    {Number(analysis.val) || 0}%
                  </p>
                  <div className="mt-4 mx-auto max-w-sm h-2.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(0, Math.min(100, Number(analysis.val) || 0))}%`, background: "#065292" }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-4">
                    How closely your assessed competencies align with this job profile.
                  </p>
                </div>
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
