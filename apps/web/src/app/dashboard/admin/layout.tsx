"use client";

import { AdminSidebar } from "./_components/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-twenty flex h-[100dvh] overflow-hidden" style={{ background: "#1d1d1d", fontFamily: "Inter, -apple-system, system-ui, sans-serif", fontSize: 13 }}>
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto" style={{ background: "#1d1d1d" }}>
        <div style={{ padding: "16px 24px", maxWidth: 1400 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
