"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { colorsDark, colorsLight, getShadcnOverrides, type AdminColors } from "@/styles/tokens";

type ThemeMode = "dark" | "light" | "system";

interface AdminThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  colors: AdminColors;
}

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

const STORAGE_KEY = "admin-theme";

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return false;
}

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem(STORAGE_KEY) as ThemeMode) || "light";
  });

  const isDark = resolveIsDark(mode);
  const colors = isDark ? colorsDark : colorsLight;

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  }, []);

  // Apply CSS variables to document root for the admin scope
  useEffect(() => {
    const root = document.documentElement;

    // Set admin-specific CSS vars
    root.style.setProperty("--admin-bg-outer", colors.bg.outer);
    root.style.setProperty("--admin-bg-panel", colors.bg.panel);
    root.style.setProperty("--admin-bg-card", colors.bg.card);
    root.style.setProperty("--admin-bg-card-hover", colors.bg.cardHover);
    root.style.setProperty("--admin-bg-input", colors.bg.input);
    root.style.setProperty("--admin-bg-hover", colors.bg.hover);
    root.style.setProperty("--admin-bg-active", colors.bg.active);
    root.style.setProperty("--admin-bg-icon-box", colors.bg.iconBox);
    root.style.setProperty("--admin-bg-overlay", colors.bg.overlay);
    root.style.setProperty("--admin-bg-noisy", isDark ? "url(/noise-dark.jpg)" : "url(/noise-light.png)");

    root.style.setProperty("--admin-border-default", colors.border.default);
    root.style.setProperty("--admin-border-hover", colors.border.hover);
    root.style.setProperty("--admin-border-light", colors.border.light);
    root.style.setProperty("--admin-border-panel", colors.border.panel);

    root.style.setProperty("--admin-font-primary", colors.font.primary);
    root.style.setProperty("--admin-font-secondary", colors.font.secondary);
    root.style.setProperty("--admin-font-tertiary", colors.font.tertiary);
    root.style.setProperty("--admin-font-light", colors.font.light);

    root.style.setProperty("--admin-accent-green", colors.accent.green);
    root.style.setProperty("--admin-accent-red", colors.accent.red);
    root.style.setProperty("--admin-accent-blue", colors.accent.blue);

    // Set shadcn overrides so components pick up the right colors
    const overrides = getShadcnOverrides(isDark ? "dark" : "light");
    for (const [key, value] of Object.entries(overrides)) {
      root.style.setProperty(key, value);
    }

    return () => {
      // Clean up only admin-prefixed vars on unmount
      // (shadcn vars will be reset by globals.css)
    };
  }, [colors, isDark]);

  // Listen for system theme changes
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setModeState("system"); // triggers re-render
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  return (
    <AdminThemeContext.Provider value={{ mode, isDark, setMode, colors }}>
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme(): AdminThemeContextValue {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) {
    throw new Error("useAdminTheme must be used within AdminThemeProvider");
  }
  return ctx;
}
