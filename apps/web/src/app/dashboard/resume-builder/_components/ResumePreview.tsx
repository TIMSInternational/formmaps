"use client";
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useGlobalStore } from "@/store/useGlobalStore";
import { Download, Eye, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LivePreviewPDF } from "./LivePreviewPDF";
import FocusTrap from "focus-trap-react";
import { ATSCheck } from "./ATSCheck";
// ATSCheck removed: resume builder step disabled in current flow

export function ResumePreview() {
  const { resumeBuilder } = useGlobalStore();
  const [isClient, setIsClient] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // ATS modal (hidden by default) - allow opening the ATS check overlay
  const [showATS, setShowATS] = useState(false);
  const [lastSavedTick, setLastSavedTick] = useState<number | null>(null);

  // Watch autosave state, announce 'Saved' when isDirty flips false
  useEffect(() => {
    const unsub = useGlobalStore.subscribe((state) => {
      if (!state.resumeBuilder.isDirty) {
        setLastSavedTick(Date.now());
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Close preview with Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showPreview) setShowPreview(false);
    };
    if (showPreview) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showPreview]);

  // Close ATS with Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showATS) setShowATS(false);
    };
    if (showATS) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showATS]);

  const handleDownload = async () => {
    try {
      // Dynamically import React PDF
      const { pdf } = await import("@react-pdf/renderer");

      // Import the PDF template renderer
      const { createPDFDocument } = await import("./PDFTemplateRenderer");

      // Create PDF document
      const pdfDoc = createPDFDocument(resumeBuilder.data);

      // Generate PDF blob
      const blob = await pdf(pdfDoc).toBlob();

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${
        resumeBuilder.data.personalInfo.fullName || "resume"
      }.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      // Fallback to preview modal
      setShowPreview(true);
    }
  };

  if (!isClient) {
    return null;
  }

  return (
    <>
      {/* Action Buttons */}
      <div className="flex items-center space-x-2">
        <button
          onClick={() => setShowPreview(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Eye size={16} />
          Preview
        </button>

        <button
          onClick={handleDownload}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Download size={16} />
          Download PDF
        </button>
      </div>

      {/* Preview Modal - Fullscreen with Portal */}
      {showPreview &&
        isClient &&
        createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-75 z-[9999] flex flex-col"
            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="w-full h-full bg-white flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Focus Trap: keep keyboard focus inside preview for accessibility */}
              <FocusTrap>
                <div
                  role="dialog"
                  aria-label="Resume preview"
                  className="w-full h-full"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b bg-white shadow-sm print:hidden">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Resume Preview
                    </h3>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => window.print()}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <Download size={16} />
                        Print/Save as PDF
                      </button>
                      <button
                        onClick={() => setShowATS(true)}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        ATS Check
                      </button>
                      <button
                        onClick={() => setShowPreview(false)}
                        className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-2 rounded-full transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    {lastSavedTick && (
                      <div className="absolute left-6 top-6 text-sm text-green-600">
                        Saved
                      </div>
                    )}
                    <div aria-live="polite" className="sr-only">
                      {lastSavedTick ? "Resume saved" : ""}
                    </div>
                  </div>

                  {/* Template Preview Container */}
                  <div className="flex-1 bg-gray-50 p-8 print:p-0 print:bg-white">
                    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden print:shadow-none print:max-w-none">
                      <div
                        style={{ height: "800px" }}
                        className="w-full print:h-auto"
                      >
                        <LivePreviewPDF className="w-full h-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </FocusTrap>
            </motion.div>
          </motion.div>,
          document.body
        )}

      {showATS &&
        isClient &&
        createPortal(
          <ATSCheck onClose={() => setShowATS(false)} />,
          document.body
        )}
    </>
  );
}
