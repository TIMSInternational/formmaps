"use client";

import CareerDetails from "@/components/career/CareerDetails";
import { Sidebar } from "@/app/dashboard/_components/Sidebar";
import { TopNav } from "@/app/dashboard/_components/TopNav";

export default function CareerDetailsPage() {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={false} onClose={() => {}} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNav onMenuClick={() => {}} />
        <main className="flex-1 overflow-y-auto p-6">
          <CareerDetails />
        </main>
      </div>
    </div>
  );
}
