"use client";

export default function Layout({ children }: { children: React.ReactNode }) {
  // The main DashboardLayout already handles the sidebar based on user role (Admin/Coach/Student).
  // So we just render the children here to avoid double sidebars.
  return <>{children}</>;
}
