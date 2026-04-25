"use client";

import { useGlobalStore } from "@/store/useGlobalStore";
import { AccessibleLanguageSwitcher } from "@/components/accessibility/AccessibleLanguageSwitcher";
import { List, Lightning } from "@phosphor-icons/react";

export function GlassTopNav() {
  return (
    <header className="w-full relative z-50 p-6 flex items-center justify-between pointer-events-none">
      {/* Spacer for sidebar toggle if needed, or left logo */}
      <div className="flex-1 pointer-events-auto flex items-center">
         {/* Secondary logo or empty since sidebar is present */}
      </div>

      {/* Central Pill Nav */}
      <div className="flex-1 flex justify-center pointer-events-auto">
        <div className="bg-[#1a1a1a] p-1.5 rounded-full flex items-center shadow-lg">
          <button className="flex items-center px-6 py-3 bg-[#e6e2dd] rounded-full text-slate-900 font-medium text-sm transition-transform hover:scale-105">
            <List className="w-4 h-4 mr-2" /> Menu
          </button>
          <button className="flex items-center px-6 py-3 text-slate-300 font-medium text-sm transition-colors hover:text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-2" /> Explore Profile
          </button>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex-1 flex justify-end items-center gap-4 pointer-events-auto">
        <div className="bg-white/40 backdrop-blur-md border border-white/60 px-5 py-3 rounded-full flex items-center shadow-sm">
          <Lightning weight="fill" className="w-4 h-4 mr-2 text-slate-900" />
          <span className="text-sm font-medium text-slate-900">Career Solutions</span>
        </div>
        <AccessibleLanguageSwitcher />
      </div>
    </header>
  );
}
