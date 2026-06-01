// Twenty CRM-inspired color tokens for FORMMAPS admin theme
// Dark values from twenty-ui/theme-dark.css, light from theme-light.css

export const colorsDark = {
  bg: {
    outer: "#1d1d1d",
    panel: "#171717",
    card: "#1e1e1e",
    cardHover: "#222",
    input: "#1e1e1e",
    overlay: "rgba(0,0,0,0.5)",
    hover: "rgba(255,255,255,0.06)",
    active: "rgba(255,255,255,0.10)",
    iconBox: "#2a2a2a",
  },
  border: {
    default: "#333",
    hover: "#444",
    light: "#2a2a2a",
    panel: "#333",
  },
  font: {
    primary: "#ebebeb",
    secondary: "#b3b3b3",
    tertiary: "#818181",
    light: "#555",
    sectionLabel: "#666",
  },
  accent: {
    green: "#10b981",
    red: "#ef4444",
    blue: "#065292",
    purple: "#8b5cf6",
    amber: "#f59e0b",
    orange: "#f97316",
  },
  // Low-opacity accent backgrounds for dark theme
  accentBg: {
    green: "rgba(16,185,129,0.10)",
    red: "rgba(239,68,68,0.10)",
    blue: "rgba(6,82,146,0.10)",
    purple: "rgba(139,92,246,0.10)",
    amber: "rgba(245,158,11,0.10)",
    orange: "rgba(249,115,22,0.10)",
    greenSubtle: "rgba(16,185,129,0.05)",
    blueSubtle: "rgba(6,82,146,0.05)",
    purpleSubtle: "rgba(139,92,246,0.05)",
    orangeSubtle: "rgba(249,115,22,0.05)",
  },
  accentBorder: {
    green: "rgba(16,185,129,0.15)",
    red: "rgba(239,68,68,0.15)",
    blue: "rgba(6,82,146,0.15)",
    purple: "rgba(139,92,246,0.15)",
    amber: "rgba(245,158,11,0.15)",
    orange: "rgba(249,115,22,0.15)",
  },
} as const;

export const colorsLight = {
  bg: {
    outer: "#f0f0f0",
    panel: "#ffffff",
    card: "#ffffff",
    cardHover: "#fafafa",
    input: "#ffffff",
    overlay: "rgba(255,255,255,0.8)",
    hover: "rgba(0,0,0,0.04)",
    active: "rgba(0,0,0,0.08)",
    iconBox: "#f0f0f0",
  },
  border: {
    default: "#e0e0e0",
    hover: "#d0d0d0",
    light: "#eee",
    panel: "#e0e0e0",
  },
  font: {
    primary: "#141414",
    secondary: "#474747",
    tertiary: "#818181",
    light: "#999",
    sectionLabel: "#999",
  },
  accent: {
    green: "#059669",
    red: "#dc2626",
    blue: "#065292",
    purple: "#7c3aed",
    amber: "#d97706",
    orange: "#ea580c",
  },
  accentBg: {
    green: "rgba(16,185,129,0.08)",
    red: "rgba(239,68,68,0.08)",
    blue: "rgba(6,82,146,0.08)",
    purple: "rgba(139,92,246,0.08)",
    amber: "rgba(245,158,11,0.08)",
    orange: "rgba(249,115,22,0.08)",
    greenSubtle: "rgba(16,185,129,0.04)",
    blueSubtle: "rgba(6,82,146,0.04)",
    purpleSubtle: "rgba(139,92,246,0.04)",
    orangeSubtle: "rgba(249,115,22,0.04)",
  },
  accentBorder: {
    green: "rgba(16,185,129,0.20)",
    red: "rgba(239,68,68,0.20)",
    blue: "rgba(6,82,146,0.20)",
    purple: "rgba(139,92,246,0.20)",
    amber: "rgba(245,158,11,0.20)",
    orange: "rgba(249,115,22,0.20)",
  },
} as const;

// Structural type (not literal) so both dark and light are assignable
type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};

export type AdminColors = DeepString<typeof colorsDark>;
