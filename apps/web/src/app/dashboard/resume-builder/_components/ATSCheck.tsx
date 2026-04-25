"use client";
import React, { useState } from "react";
import FocusTrap from "focus-trap-react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { getATSScore } from "./atsUtils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export function ATSCheck({ onClose }: { onClose?: () => void }) {
  const { resumeBuilder } = useGlobalStore();
  const [jobDesc, setJobDesc] = useState("");
  const [result, setResult] = useState<any>(null);

  const handleAnalyze = () => {
    const r = getATSScore(resumeBuilder.data, jobDesc);
    setResult(r);
  };

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <FocusTrap>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[9999] flex items-center justify-center"
      >
        <div
          className="absolute inset-0 bg-black opacity-40"
          onClick={() => onClose?.()}
        />
        <div className="bg-white w-full max-w-2xl mx-4 rounded-lg shadow-lg p-6 z-50">
          <div className="flex items-start justify-between">
            <h3 className="text-lg font-semibold">ATS Optimization</h3>
            <button
              aria-label="Close"
              onClick={() => onClose?.()}
              className="text-gray-700 p-2 rounded hover:bg-gray-100"
            >
              <X size={18} />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Paste a job description to compare keywords against your resume.
            This will give a simple keyword match score to help optimize for ATS
            systems.
          </p>

          <textarea
            value={jobDesc}
            onChange={(e) => setJobDesc(e.target.value)}
            placeholder="Paste job description here..."
            className="w-full h-36 border rounded p-3 mt-4"
          />

          <div className="flex items-center justify-between mt-4">
            <div>
              <Button onClick={handleAnalyze}>Analyze</Button>
            </div>
            <div className="text-sm text-gray-600">
              Tip: include responsibilities and skills to get a better analysis.
            </div>
          </div>

          {result && (
            <div className="mt-4 bg-gray-50 rounded p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">ATS Score</div>
                  <div className="text-2xl font-semibold">{result.score}%</div>
                </div>
                <div className="text-sm text-gray-500">
                  Matched: {result.matched.length}/
                  {result.missing.length + result.matched.length}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="font-medium text-sm">Matched Keywords</div>
                  <ul className="text-xs text-gray-700 mt-2">
                    {result.matched.map((m: string) => (
                      <li key={m}>• {m}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-medium text-sm">Missing Keywords</div>
                  <ul className="text-xs text-gray-700 mt-2">
                    {result.missing.map((m: string) => (
                      <li key={m}>• {m}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </FocusTrap>
  );
}
