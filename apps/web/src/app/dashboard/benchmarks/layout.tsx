"use client";

import React from "react";
import BenchmarksHeader from "./_components/BenchmarksHeader";
import { ErrorBoundarySection } from "@/components/ErrorBoundarySection";

export default function BenchmarksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const handleExportCSV = () => {
    // Implement export functionality
  };

  const handleExportImage = () => {
    // Implement export functionality
  };

  return (
    <div className="bg-gray-50/30 p-4 sm:p-6 lg:p-8 min-h-full">
      <div className="max-w-7xl mx-auto">
        <BenchmarksHeader
          onExportCSV={handleExportCSV}
          onExportImage={handleExportImage}
        />
        <div className="mt-6">
          <ErrorBoundarySection>
            {children}
          </ErrorBoundarySection>
        </div>
      </div>
    </div>
  );
}
