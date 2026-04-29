"use client";

import { AdminSidebar } from "./_components/AdminSidebar";

/**
 * Admin layout replicating Twenty CRM's exact structure from DefaultLayout.tsx:
 *
 * StyledLayout (background: noisy, height: 100dvh, flex column)
 *   └─ StyledPageContainer (flex row, flex: 1 1 auto)
 *        ├─ NavigationDrawer (flex-shrink: 0) → AdminSidebar
 *        └─ StyledMainContainer (flex: 0 1 100%, overflow: hidden)
 *             └─ PageBody
 *                  └─ PagePanel (bg: primary, border: 1px solid medium, radius: 8px)
 *
 * Colors from twenty-ui/theme-dark.css:
 *   background-primary:  #171717  (panel bg)
 *   background-secondary: #1b1b1b
 *   background-tertiary: #1d1d1d  (body bg behind panel)
 *   border-color-medium: #222
 *   border-radius-md: 8px
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="admin-twenty"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        width: "100%",
        position: "relative",
        fontFamily: "Inter, -apple-system, system-ui, sans-serif",
        fontSize: 13,
        background: "var(--admin-bg-outer, #1d1d1d)",
      }}
    >
      {/* StyledPageContainer — flex row */}
      <div style={{ display: "flex", flex: "1 1 auto", minHeight: 0 }}>
        {/* NavigationDrawer — flex-shrink: 0 */}
        <div style={{ flexShrink: 0 }}>
          <AdminSidebar />
        </div>

        {/* StyledMainContainer — flex: 0 1 100%, overflow: hidden */}
        <div style={{ display: "flex", flex: "0 1 100%", overflow: "hidden" }}>
          {/* PageBody + PagePanel — the rounded content panel */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              height: "100%",
              padding: 12,
              paddingLeft: 6,
            }}
          >
            {/* PagePanel — bg: primary, border, radius */}
            <main
              style={{
                background: "var(--admin-bg-panel, #171717)",
                border: "1px solid var(--admin-border-panel, #282828)",
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                flex: 1,
                overflow: "hidden",
              }}
            >
              <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
