"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "overview", path: "/dashboard/benchmarks/overview" },
  { key: "compensation", path: "/dashboard/benchmarks/compensation" },
  { key: "market", path: "/dashboard/benchmarks/market" },
  { key: "skills", path: "/dashboard/benchmarks/skills" },
  { key: "demographics", path: "/dashboard/benchmarks/demographics" },
];

import { useTranslation } from "react-i18next";

export function BenchmarksNav() {
  const { t } = useTranslation();
  const pathname = usePathname();

  return (
    <div className="border-b border-gray-200 mb-8">
      <nav className="-mb-px flex space-x-8 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const isActive = pathname === tab.path;
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={cn(
                "whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors",
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              {t(`dashboard.benchmarks.tabs.${tab.key}`)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
