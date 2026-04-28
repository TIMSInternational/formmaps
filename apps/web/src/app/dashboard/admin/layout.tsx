"use client";

import { AdminSidebar } from "./_components/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-twenty flex h-[100dvh] bg-white dark:bg-[#141414] overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
