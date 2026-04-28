"use client";

import { AdminSidebar } from "./_components/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-twenty flex h-[100dvh] overflow-hidden" style={{
      background: "#171717",
      fontFamily: "Inter, -apple-system, system-ui, sans-serif",
      fontSize: 13,
    }}>
      <AdminSidebar />
      {/* Main content — rounded rectangle inset panel (Twenty's signature layout) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "3px 3px 3px 0", overflow: "hidden" }}>
        <main style={{
          flex: 1,
          background: "#1d1d1d",
          borderRadius: 8,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", maxWidth: 1400 }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
