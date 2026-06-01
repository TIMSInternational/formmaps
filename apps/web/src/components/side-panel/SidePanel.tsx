"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

// ── Constants (Twenty-style) ──
const SIDE_PANEL_WIDTH_VAR = "--side-panel-width";
const STORAGE_KEY = "formmaps_side_panel_width";
const MIN_WIDTH = 320;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 400;

// ── Types ──
interface SidePanelState {
  isOpen: boolean;
  title: string;
  content: ReactNode | null;
  footer?: ReactNode;
  subtitle?: string;
}

interface SidePanelContextValue {
  openPanel: (opts: {
    title: string;
    content: ReactNode;
    footer?: ReactNode;
    subtitle?: string;
  }) => void;
  closePanel: () => void;
  isOpen: boolean;
}

const SidePanelContext = createContext<SidePanelContextValue | null>(null);

export function useSidePanel() {
  const ctx = useContext(SidePanelContext);
  if (!ctx) throw new Error("useSidePanel must be used within SidePanelProvider");
  return ctx;
}

/** Context-only provider — wrap around entire layout so sidebar + content can call openPanel */
export function SidePanelContextProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SidePanelState>({
    isOpen: false,
    title: "",
    content: null,
  });

  const openPanel = useCallback(
    (opts: { title: string; content: ReactNode; footer?: ReactNode; subtitle?: string }) => {
      setState({ isOpen: true, ...opts });
    },
    [],
  );

  const closePanel = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false }));
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!state.isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.isOpen, closePanel]);

  return (
    <SidePanelContext.Provider value={{ openPanel, closePanel, isOpen: state.isOpen }}>
      <SidePanelStateContext.Provider value={state}>
        {children}
      </SidePanelStateContext.Provider>
    </SidePanelContext.Provider>
  );
}

// Internal state context so the renderer can read panel state
const SidePanelStateContext = createContext<SidePanelState>({
  isOpen: false,
  title: "",
  content: null,
});

/** Inline renderer — place inside a flex-row container next to main content */
export function SidePanelRenderer() {
  const state = useContext(SidePanelStateContext);
  const { closePanel } = useSidePanel();
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(DEFAULT_WIDTH);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const w = saved ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(saved))) : DEFAULT_WIDTH;
    widthRef.current = w;
    document.documentElement.style.setProperty(SIDE_PANEL_WIDTH_VAR, `${w}px`);
  }, []);

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = widthRef.current;

    function onMove(ev: PointerEvent) {
      const delta = startX - ev.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      widthRef.current = newWidth;
      document.documentElement.style.setProperty(SIDE_PANEL_WIDTH_VAR, `${newWidth}px`);
    }

    function onUp() {
      setIsResizing(false);
      localStorage.setItem(STORAGE_KEY, String(widthRef.current));
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, []);

  return (
    <>
      {/* Resize gap */}
      {state.isOpen && (
        <div
          onPointerDown={startResize}
          style={{
            width: 8,
            flexShrink: 0,
            cursor: "col-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{
            width: 2, height: 32, borderRadius: 1,
            background: "var(--admin-border-default, #2a2a2a)",
            transition: "background 0.15s",
          }} />
        </div>
      )}

      {/* Side Panel */}
      <div style={{
        flexShrink: 0, minWidth: 0, overflow: "hidden",
        transition: isResizing ? "none" : "width 0.3s ease",
        width: state.isOpen ? `var(${SIDE_PANEL_WIDTH_VAR}, ${DEFAULT_WIDTH}px)` : "0px",
      }}>
        <AnimatePresence>
          {state.isOpen && state.content && (
            <motion.aside
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, delay: 0.05 }}
              style={{
                display: "flex", flexDirection: "column", height: "100%", width: "100%",
                overflow: "hidden",
                background: "var(--admin-bg-panel, #171717)",
                border: "1px solid var(--admin-border-panel, #282828)",
                borderRadius: 8,
              }}
            >
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 8, height: 44, padding: "0 12px", flexShrink: 0,
                borderBottom: "1px solid var(--admin-border-default, #2a2a2a)",
                background: "var(--admin-bg-card, #1e1e1e)",
                borderTopLeftRadius: 8, borderTopRightRadius: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                  <button onClick={closePanel} style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 24, height: 24, borderRadius: 4, border: "none",
                    background: "transparent", cursor: "pointer",
                    color: "var(--admin-font-tertiary, #818181)", flexShrink: 0,
                  }}>
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary, #ebebeb)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {state.title}
                    </div>
                    {state.subtitle && (
                      <div style={{ fontSize: 11, color: "var(--admin-font-light, #555)", whiteSpace: "nowrap" }}>
                        {state.subtitle}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                {state.content}
              </div>

              {/* Footer */}
              {state.footer && (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "flex-end",
                  gap: 8, padding: "8px 12px", flexShrink: 0,
                  borderTop: "1px solid var(--admin-border-default, #2a2a2a)",
                  background: "var(--admin-bg-card, #1e1e1e)",
                  borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
                }}>
                  {state.footer}
                </div>
              )}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/** Legacy combined provider (for places that still use the old API) */
export function SidePanelProvider({ children }: { children: ReactNode }) {
  return (
    <SidePanelContextProvider>
      <div style={{ display: "flex", flex: "1 1 0", flexDirection: "column", minWidth: 0, width: 0 }}>
        {children}
      </div>
      <SidePanelRenderer />
    </SidePanelContextProvider>
  );
}
