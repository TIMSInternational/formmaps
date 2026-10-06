"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useGlobalStore } from "@/store/useGlobalStore";
import { cn } from "@/lib/utils";
import { Loader2, FileText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";

type ResumeTemplateData = ReturnType<typeof useGlobalStore.getState>["resumeBuilder"]["data"];
type TemplateComponent = React.ComponentType<{ data: ResumeTemplateData }>;
type PdfFactory = (typeof import("@react-pdf/renderer"))["pdf"];

const TEMPLATE_LOADERS: Record<string, () => Promise<TemplateComponent>> = {
  classic: () => import("./templates/ClassicTemplate").then((m) => m.ClassicTemplatePDF as TemplateComponent),
  modern: () => import("./templates/ModernTemplate").then((m) => m.ModernTemplatePDF as TemplateComponent),
  creative: () => import("./templates/CreativeTemplate").then((m) => m.CreativeTemplatePDF as TemplateComponent),
  minimal: () => import("./templates/MinimalTemplate").then((m) => m.MinimalTemplatePDF as TemplateComponent),
  executive: () => import("./templates/ExecutiveTemplate").then((m) => m.ExecutiveTemplatePDF as TemplateComponent),
  tech: () => import("./templates/TechTemplate").then((m) => m.TechTemplatePDF as TemplateComponent),
};

const PENDING_LOAD_TIMEOUT_MS = 4000;

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

/** A white A4 page with grey bars — shown from the first frame until the PDF is up. */
function PreviewSkeleton({ label }: { label: string }) {
  return (
    <div
      data-testid="resume-preview-skeleton"
      role="status"
      aria-label={label}
      className="absolute inset-0 flex justify-center overflow-hidden p-4"
    >
      <div className="w-full max-w-[640px] aspect-[1/1.414] bg-white shadow-sm rounded-sm p-8 space-y-3 animate-pulse">
        <div className="mx-auto h-5 w-1/2 rounded bg-gray-200" />
        <div className="mx-auto h-2.5 w-2/3 rounded bg-gray-100" />
        {[0, 1, 2].map((block) => (
          <div key={block} className="space-y-2 pt-4">
            <div className="h-3 w-1/4 rounded bg-gray-200" />
            <div className="h-px w-full bg-gray-200" />
            <div className="h-2.5 w-full rounded bg-gray-100" />
            <div className="h-2.5 w-11/12 rounded bg-gray-100" />
            <div className="h-2.5 w-4/5 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface LivePreviewPDFProps {
  className?: string;
}

/**
 * Live PDF preview of the resume being edited.
 *
 * The PDF is rendered to a blob off-screen and shown in an iframe only once
 * that iframe has loaded; the page already on screen stays up until then. The
 * old implementation used react-pdf's <PDFViewer> keyed on section counts and
 * the UI language, plus a template-loader effect keyed on `t` — every key or
 * language change destroyed the iframe and Chrome re-initialised its PDF plugin
 * (a dark empty frame for seconds, longest in Spanish). See formmaps-platform#406.
 */
export function LivePreviewPDF({ className = "" }: LivePreviewPDFProps = {}) {
  const { t, i18n: i18nInstance } = useTranslation();
  const { resumeBuilder } = useGlobalStore();
  const { data } = resumeBuilder;

  // Debounce the resume data to prevent excessive re-renders, but keep template changes immediate
  const debouncedData = useDebounce(data, 300);
  const currentTemplate = data.template;
  const isDataChanging = data !== debouncedData;

  const [pdfFactory, setPdfFactory] = useState<PdfFactory | null>(null);
  const [template, setTemplate] = useState<TemplateComponent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  // `shownUrl` is on screen; `pendingUrl` is loading invisibly behind it.
  const [shownUrl, setShownUrl] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const urlsRef = useRef<{ shown: string | null; pending: string | null }>({ shown: null, pending: null });

  // react-pdf is ~1 MB — load it once, lazily.
  useEffect(() => {
    let active = true;
    import("@react-pdf/renderer")
      .then((reactPdf) => {
        if (active) setPdfFactory(() => reactPdf.pdf);
      })
      .catch(() => {
        if (active) setError(i18n.t("resumeBuilder.livePreview.loadFailed", "Failed to load PDF components. Please try again."));
      });
    return () => {
      active = false;
    };
  }, [retryNonce]);

  useEffect(() => {
    let active = true;
    (TEMPLATE_LOADERS[currentTemplate] ?? TEMPLATE_LOADERS.modern)()
      .then((component) => {
        if (active) setTemplate(() => component);
      })
      .catch(() => {
        if (active) setError(i18n.t("resumeBuilder.livePreviewPDF.templateLoadFailed", "Failed to load template. Please try again."));
      });
    return () => {
      active = false;
    };
  }, [currentTemplate, retryNonce]);

  // Render the document to a blob whenever data, template or UI language change.
  useEffect(() => {
    if (!pdfFactory || !template) return;
    let active = true;
    const Template = template;
    pdfFactory(<Template data={debouncedData} />)
      .toBlob()
      .then((blob) => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        const stale = urlsRef.current.pending;
        if (stale) URL.revokeObjectURL(stale);
        urlsRef.current.pending = url;
        setPendingUrl(url);
      })
      .catch(() => {
        if (active) setError(i18n.t("resumeBuilder.livePreview.errorBody", "There was an issue rendering the PDF preview. Your data is safe."));
      });
    return () => {
      active = false;
    };
  }, [pdfFactory, template, debouncedData, i18nInstance.language]);

  // The pending page finished loading → it becomes the visible one.
  const promotePending = useCallback(() => {
    const { shown, pending } = urlsRef.current;
    if (!pending) return;
    if (shown) URL.revokeObjectURL(shown);
    urlsRef.current = { shown: pending, pending: null };
    setShownUrl(pending);
    setPendingUrl(null);
  }, []);

  // Safety net: if a browser never fires `load` for a PDF iframe, don't leave
  // the skeleton (or the stale page) up forever.
  useEffect(() => {
    if (!pendingUrl) return;
    const timer = setTimeout(promotePending, PENDING_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingUrl, promotePending]);

  useEffect(
    () => () => {
      const { shown, pending } = urlsRef.current;
      if (shown) URL.revokeObjectURL(shown);
      if (pending) URL.revokeObjectURL(pending);
    },
    []
  );

  // Keyed by URL in a stable list: promoting the pending iframe keeps its DOM
  // node (no reload), it just stops being invisible.
  const frameUrls = [shownUrl, pendingUrl].filter((u): u is string => Boolean(u));

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
            <h3 className="text-sm font-medium text-gray-900">{t("resumeBuilder.livePreviewPDF.title", "Live Preview")}</h3>
            {(isDataChanging || (pendingUrl !== null && shownUrl !== null)) && (
              <div className="flex items-center space-x-1 text-xs text-[#2E9098]">
                <Loader2 size={12} className="animate-spin" />
                <span>{t("resumeBuilder.livePreviewPDF.updating", "Updating...")}</span>
              </div>
            )}
            {/* Announce updates for screen readers */}
            <div aria-live="polite" className="sr-only">
              {isDataChanging
                ? t("resumeBuilder.livePreviewPDF.srUpdating", "Preview is updating")
                : t("resumeBuilder.livePreviewPDF.srUpdated", "Preview updated")}
            </div>
          </div>
          <div className="text-xs text-gray-500">
            {t("resumeBuilder.livePreviewPDF.template", {
              defaultValue: "Template: {{name}}",
              name: currentTemplate || "Modern",
            })}
          </div>
        </div>
      </div>

      {/* PDF Viewer Container */}
      <div className="relative flex-1 bg-gray-50 min-h-0">
        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <X size={24} className="text-red-600" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">
                {t("resumeBuilder.livePreviewPDF.errorTitle", "Preview Error")}
              </h3>
              <p className="text-xs text-gray-600 mb-3">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setRetryNonce((n) => n + 1);
                }}
                className="bg-[#2E9098] hover:bg-[#2E9098]/90 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
              >
                {t("resumeBuilder.livePreviewPDF.retry", "Retry")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {frameUrls.map((url) => {
              const isShown = url === shownUrl;
              return (
                <iframe
                  key={url}
                  title={t("resumeBuilder.livePreviewPDF.title", "Live Preview")}
                  src={`${url}#toolbar=0&navpanes=0`}
                  onLoad={isShown ? undefined : promotePending}
                  aria-hidden={isShown ? undefined : true}
                  tabIndex={isShown ? undefined : -1}
                  className={cn(
                    "absolute inset-0 h-full w-full border-0 bg-gray-50",
                    !isShown && "opacity-0 pointer-events-none"
                  )}
                />
              );
            })}
            {!shownUrl && (
              <PreviewSkeleton label={t("resumeBuilder.livePreviewPDF.loading", "Loading PDF preview...")} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
