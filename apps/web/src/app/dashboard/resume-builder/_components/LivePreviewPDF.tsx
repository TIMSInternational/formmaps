"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Loader2, FileText, X } from "lucide-react";

// PDF Error Boundary Component
class PDFErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <X size={24} className="text-red-600" />
            </div>
            <h3 className="text-sm font-medium text-gray-900 mb-2">
              PDF Preview Error
            </h3>
            <p className="text-xs text-gray-600 mb-3">
              There was an issue rendering the PDF preview. Your data is safe.
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface LivePreviewPDFProps {
  className?: string;
}

export function LivePreviewPDF({ className = "" }: LivePreviewPDFProps = {}) {
  const { resumeBuilder } = useGlobalStore();
  const { data } = resumeBuilder;

  // Debounce the resume data to prevent excessive re-renders, but keep template changes immediate
  const debouncedData = useDebounce(data, 300); // 300ms delay
  const { personalInfo, experience, education, skills } = debouncedData;

  // Use immediate template for better UX (no delay on template changes)
  const currentTemplate = data.template;

  // Track if data is currently being debounced
  const isDataChanging = JSON.stringify(data) !== JSON.stringify(debouncedData);

  const [pdfComponents, setPdfComponents] = useState<any>(null);
  const [templateComponent, setTemplateComponent] = useState<any>(null);
  const [isClient, setIsClient] = useState(false);
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Lazy load PDF components on mount
  useEffect(() => {
    if (!pdfComponents && isClient) {
      setLoadingPDF(true);
      setPdfError(null);

      import("@react-pdf/renderer")
        .then((reactPdf) => {
          setPdfComponents({
            PDFViewer: reactPdf.PDFViewer,
          });
          setLoadingPDF(false);
        })
        .catch((error) => {
          setPdfError("Failed to load PDF components. Please try again.");
          setLoadingPDF(false);
        });
    }
  }, [pdfComponents, isClient]);

  // Lazy load template component when template changes
  useEffect(() => {
    if (!isClient) return;

    setLoadingPDF(true);
    setPdfError(null);

    const loadTemplate = async () => {
      try {
        let TemplateComponent;

        switch (currentTemplate) {
          case "classic":
            TemplateComponent = (await import("./templates/ClassicTemplate"))
              .ClassicTemplatePDF;
            break;
          case "modern":
            TemplateComponent = (await import("./templates/ModernTemplate"))
              .ModernTemplatePDF;
            break;
          case "creative":
            TemplateComponent = (await import("./templates/CreativeTemplate"))
              .CreativeTemplatePDF;
            break;
          case "minimal":
            TemplateComponent = (await import("./templates/MinimalTemplate"))
              .MinimalTemplatePDF;
            break;
          case "executive":
            TemplateComponent = (await import("./templates/ExecutiveTemplate"))
              .ExecutiveTemplatePDF;
            break;
          case "tech":
            TemplateComponent = (await import("./templates/TechTemplate"))
              .TechTemplatePDF;
            break;
          default:
            TemplateComponent = (await import("./templates/ModernTemplate"))
              .ModernTemplatePDF;
        }

        setTemplateComponent(() => TemplateComponent);
        setLoadingPDF(false);
      } catch (error) {
        setPdfError("Failed to load template. Please try again.");
        setLoadingPDF(false);
      }
    };

    loadTemplate();
  }, [currentTemplate, isClient]);

  // Create PDF document matching the selected template
  const renderPDFTemplate = useMemo(() => {
    if (!templateComponent) return null;

    try {
      const TemplateComponent = templateComponent;

      // Use the debounced data to pass to the template
      return <TemplateComponent data={debouncedData} />;
    } catch (error) {
      return null;
    }
  }, [templateComponent, debouncedData]);

  const dynamicSectionsSignature = useMemo(() => {
    const sections = debouncedData.dynamicSections || [];
    if (!sections.length) {
      return "no-dynamic-sections";
    }

    return sections
      .map((section) => {
        const entryCount = section.entries?.length || 0;
        const contentSignature = [
          section.description?.length || 0,
          section.bullets?.length || 0,
        ].join(":");

        return `${section.id}:${section.type}:${entryCount}:${contentSignature}`;
      })
      .join("|");
  }, [debouncedData.dynamicSections]);

  const pdfViewerKey = useMemo(
    () =>
      [
        skills.length,
        experience.length,
        education.length,
        dynamicSectionsSignature,
      ].join("-"),
    [
      skills.length,
      experience.length,
      education.length,
      dynamicSectionsSignature,
    ]
  );

  if (!isClient) {
    return null;
  }

  return (
    <div
      className={cn(
        "h-[calc(100vh-12rem)] flex flex-col bg-gray-50",
        className
      )}
    >
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText size={18} className="text-gray-600" />
            <h3 className="text-sm font-medium text-gray-900">Live Preview</h3>
            {isDataChanging && (
              <div className="flex items-center space-x-1 text-xs text-blue-600">
                <Loader2 size={12} className="animate-spin" />
                <span>Updating...</span>
              </div>
            )}
            {/* Announce updates for screen readers */}
            <div aria-live="polite" className="sr-only">
              {isDataChanging ? "Preview is updating" : "Preview updated"}
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Template: {currentTemplate || "Modern"}
          </div>
        </div>
      </div>

      {/* PDF Viewer Container */}
      <div className="flex-1 bg-gray-50 min-h-0">
        {loadingPDF ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2
                size={32}
                className="animate-spin text-blue-600 mx-auto mb-3"
              />
              <p className="text-sm text-gray-600">Loading PDF preview...</p>
            </div>
          </div>
        ) : pdfError ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <X size={24} className="text-red-600" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">
                Preview Error
              </h3>
              <p className="text-xs text-gray-600 mb-3">{pdfError}</p>
              <button
                onClick={() => {
                  setPdfError(null);
                  setPdfComponents(null);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        ) : pdfComponents && renderPDFTemplate ? (
          <PDFErrorBoundary>
            <div className="w-full h-full">
              <pdfComponents.PDFViewer
                key={pdfViewerKey}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  backgroundColor: "#f9fafb",
                }}
                showToolbar={false}
              >
                {renderPDFTemplate}
              </pdfComponents.PDFViewer>
            </div>
          </PDFErrorBoundary>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FileText size={32} className="text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                PDF preview will appear here
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
