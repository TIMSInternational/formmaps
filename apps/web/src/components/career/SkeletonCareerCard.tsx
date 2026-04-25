"use client";

import React from "react";

export default function SkeletonCareerCard() {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm animate-pulse">
      <div className="h-28 bg-gray-200 rounded mb-4"></div>
      <div className="h-4 bg-gray-200 rounded w-5/6 mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
    </div>
  );
}
