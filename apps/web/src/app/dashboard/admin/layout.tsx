"use client";

import { AdminSidebar } from "./_components/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-twenty flex h-[100dvh] overflow-hidden" style={{ background: "#1a1a1a" }}>
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto" style={{ background: "#1a1a1a" }}>
        <div className="px-6 py-5" style={{ maxWidth: 1400 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
