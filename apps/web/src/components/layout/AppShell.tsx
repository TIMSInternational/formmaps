"use client";

import { SidePanelContextProvider, SidePanelRenderer } from "@/components/side-panel/SidePanel";
import { PageTopBar } from "@/components/layout/PageTopBar";

interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  /** Extra className on the sidebar wrapper (e.g. "hidden md:block" for responsive) */
  sidebarClassName?: string;
  /** Elements rendered at the end of the root container (e.g. MobileNav, CommandPalette) */
  overlay?: React.ReactNode;
}

export function AppShell({ sidebar, children, sidebarClassName, overlay }: AppShellProps) {
  return (
    <SidePanelContextProvider>
      <div
        className="admin-twenty"
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
          width: "100%",
          position: "relative",
          fontFamily: "var(--admin-font-family, Inter, -apple-system, system-ui, sans-serif)",
          fontSize: 13,
          background: "var(--admin-bg-noisy) repeat, var(--admin-bg-outer)",
        }}
      >
        <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "row", minHeight: 0 }}>
          <div className={sidebarClassName} style={{ flexShrink: 0 }}>
            {sidebar}
          </div>

          <div style={{ display: "flex", flex: "0 1 100%", overflow: "hidden" }}>
            <div style={{
              display: "flex", flex: "1 1 auto", flexDirection: "column",
              paddingRight: 12, paddingBottom: 12, boxSizing: "border-box",
              width: "100%", minHeight: 0,
            }}>
              <PageTopBar />

              <div style={{ display: "flex", flex: "1 1 auto", gap: 8, minHeight: 0 }}>
                <main
                  id="main-content"
                  style={{
                    background: "var(--admin-bg-panel)",
                    border: "1px solid var(--admin-border-panel)",
                    borderRadius: 8,
                    display: "flex", flexDirection: "column",
                    flex: 1, overflowX: "auto", overflowY: "hidden",
                    width: "100%", minWidth: 0,
                  }}
                >
                  <div className="flex-1 overflow-y-auto px-4 py-4 pb-20 md:pb-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
                    {children}
                  </div>
                </main>
                <SidePanelRenderer />
              </div>
            </div>
          </div>
        </div>

        {overlay}
      </div>
    </SidePanelContextProvider>
  );
}
