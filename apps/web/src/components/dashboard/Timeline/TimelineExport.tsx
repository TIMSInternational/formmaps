"use client";

import React from "react";
import { Download, FileText, Table2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { TimelineExportProps, TimelineExportConfig } from "@/types/timeline";
import { useGlobalStore } from "@/store/useGlobalStore";
import { pdf } from "@react-pdf/renderer";
import { TimelinePDFDocument } from "./TimelinePDFDocument";
import { saveAs } from "file-saver";

/**
 * Timeline Export Component
 * Provides PDF and CSV export options
 */
export function TimelineExport({
  events,
  filters,
  onExport,
  isExporting,
}: TimelineExportProps) {
  const { language } = useGlobalStore();
  const [isGeneratingPDF, setIsGeneratingPDF] = React.useState(false);

  const handleExport = async (format: "pdf" | "csv") => {
    if (format === "csv") {
      const config: TimelineExportConfig = {
        format,
        dateRange: filters.dateRange,
        filterTypes: filters.types,
        filterStatus: filters.status,
        includeDetails: true,
        language: language === "spanish" ? "sp" : "en",
      };
      await onExport(config);
    } else if (format === "pdf") {
      setIsGeneratingPDF(true);
      try {
        const blob = await pdf(
          <TimelinePDFDocument
            events={events}
            language={language === "spanish" ? "sp" : "en"}
          />
        ).toBlob();
        saveAs(blob, `timeline-report-${new Date().toISOString().split("T")[0]}.pdf`);
      } catch (error) {
      // error handled silently
    } finally {
        setIsGeneratingPDF(false);
      }
    }
  };

  const eventCount = events.length;
  const isLoading = isExporting || isGeneratingPDF;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading || eventCount === 0}
          className="gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {language === "spanish" ? "Exportando..." : "Exporting..."}
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              {language === "spanish" ? "Exportar" : "Export"}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {language === "spanish"
            ? `Exportar ${eventCount} eventos`
            : `Export ${eventCount} events`}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleExport("csv")}
          className="cursor-pointer"
        >
          <Table2 className="h-4 w-4 mr-2" />
          <div className="flex flex-col">
            <span>CSV</span>
            <span className="text-xs text-muted-foreground">
              {language === "spanish"
                ? "Hoja de cálculo"
                : "Spreadsheet format"}
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("pdf")}
          className="cursor-pointer"
        >
          <FileText className="h-4 w-4 mr-2" />
          <div className="flex flex-col">
            <span>PDF</span>
            <span className="text-xs text-muted-foreground">
              {language === "spanish"
                ? "Documento imprimible"
                : "Printable document"}
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default TimelineExport;
