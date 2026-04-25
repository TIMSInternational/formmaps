"use client";

import React from "react";
import BenchmarksHeader from "./_components/BenchmarksHeader";

export default function BenchmarksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const handleExportCSV = () => {
    // Implement export functionality
    console.log("Exporting CSV...");
  };

  const handleExportImage = () => {
    // Implement export functionality
    console.log("Exporting Image...");
  };

  return (
    <div className="bg-gray-50/30 p-4 sm:p-6 lg:p-8 min-h-full">
      <div className="max-w-7xl mx-auto">
        <BenchmarksHeader
          onExportCSV={handleExportCSV}
          onExportImage={handleExportImage}
        />
        <div className="mt-6">
          {children}
        </div>
      </div>
    </div>
  );
}
