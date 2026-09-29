"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Keyboard } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

const SHORTCUTS = [
  { keys: ["Cmd", "K"], descriptionKey: "components.keyboardShortcuts.openCommandPalette" },
  { keys: ["?"], descriptionKey: "components.keyboardShortcuts.showShortcuts" },
  { keys: ["Esc"], descriptionKey: "components.keyboardShortcuts.closePanel" },
  { keys: ["1-9"], descriptionKey: "components.keyboardShortcuts.quickNavigate" },
];

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-[20%] z-50 w-[90vw] max-w-[400px] -translate-x-1/2 rounded-xl overflow-hidden"
            style={{
              background: "var(--admin-bg-card, #1e1e1e)",
              border: "1px solid var(--admin-border-default, #2a2a2a)",
              boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--admin-border-default)" }}
            >
              <div className="flex items-center gap-2">
                <Keyboard className="h-4 w-4" style={{ color: "var(--admin-font-tertiary)" }} />
                <span className="text-sm font-semibold" style={{ color: "var(--admin-font-primary)" }}>
                  {t("components.keyboardShortcuts.title")}
                </span>
              </div>
              <button onClick={() => setOpen(false)} aria-label={t("components.keyboardShortcuts.close")} style={{ color: "var(--admin-font-tertiary)" }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Shortcuts list */}
            <div className="px-5 py-3 space-y-1">
              {SHORTCUTS.map((s) => (
                <div
                  key={s.descriptionKey}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-sm" style={{ color: "var(--admin-font-secondary)" }}>
                    {t(s.descriptionKey)}
                  </span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="inline-flex items-center justify-center rounded px-2 py-0.5 text-[11px] font-medium min-w-[24px]"
                        style={{
                          background: "var(--admin-bg-hover)",
                          color: "var(--admin-font-tertiary)",
                          border: "1px solid var(--admin-border-default)",
                        }}
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div
              className="px-5 py-3 text-center"
              style={{ borderTop: "1px solid var(--admin-border-default)" }}
            >
              <span className="text-[11px]" style={{ color: "var(--admin-font-light)" }}>
                <Trans
                  i18nKey="components.keyboardShortcuts.footer"
                  components={{
                    kbd: <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: "var(--admin-bg-hover)", border: "1px solid var(--admin-border-default)" }} />,
                  }}
                />
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
