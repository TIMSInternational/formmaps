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
    blue: "#2E9098",
    purple: "#8b5cf6",
    amber: "#f59e0b",
    orange: "#f97316",
  },
  // Low-opacity accent backgrounds for dark theme
  accentBg: {
    green: "rgba(16,185,129,0.10)",
    red: "rgba(239,68,68,0.10)",
    blue: "rgba(46,144,152,0.10)",
    purple: "rgba(139,92,246,0.10)",
    amber: "rgba(245,158,11,0.10)",
    orange: "rgba(249,115,22,0.10)",
    greenSubtle: "rgba(16,185,129,0.05)",
    blueSubtle: "rgba(46,144,152,0.05)",
    purpleSubtle: "rgba(139,92,246,0.05)",
    orangeSubtle: "rgba(249,115,22,0.05)",
  },
  accentBorder: {
    green: "rgba(16,185,129,0.15)",
    red: "rgba(239,68,68,0.15)",
    blue: "rgba(46,144,152,0.15)",
    purple: "rgba(139,92,246,0.15)",
    amber: "rgba(245,158,11,0.15)",
    orange: "rgba(249,115,22,0.15)",
  },
} as const;

/**
 * The light palette. Twelve neutral values, warmed.
 *
 * WHY THIS ONE FILE MOVES EVERYTHING. `admin-theme.css` already remaps every `bg-white` and
 * `text-gray-*` utility onto these tokens, so changing them here recolours all ~2,572 grey
 * utilities at once with no page edits. That is also why the greys won so completely: measured
 * across the app, grey utilities outnumber teal ones 86 to 1, and the brand hexes are reached for
 * constantly (`#2E9098` appears 825 times) but always as raw literals, never through a token.
 *
 * WHERE THESE VALUES COME FROM, stated plainly because it matters for review: the audit note that
 * prompted this says "the 12 warm values" but does not list them. These are DERIVED from the brand
 * tokens that note does document -- cream `#F2F0E7`, navy `#102B47`, body slate `#3E4C61` -- which
 * are the PDF report's own palette, of which exactly one of 22 tokens had reached the app. Treat
 * the specific hexes as a proposal to diff against the intended set, not as a transcription.
 *
 * Contrast is pinned by colors-contrast.test.ts rather than eyeballed. Two facts drove the text
 * colours: navy on white is 14.4:1, and brand teal `#2E9098` on white is 3.78:1 -- which FAILS
 * AA for body text, so `accent.blue` uses `#247A86` (4.9:1) for anything that is text.
 */
export const colorsLight = {
  bg: {
    outer: "#F2F0E7",       // the brand cream, previously #f0f0f0
    panel: "#FFFDF8",       // warm white, previously #ffffff
    card: "#FFFDF8",
    cardHover: "#FAF7EF",
    input: "#FFFDF8",
    overlay: "rgba(255,253,248,0.8)",
    hover: "rgba(16,43,71,0.04)",   // navy-tinted, not neutral black
    active: "rgba(16,43,71,0.08)",
    iconBox: "#EFEBDF",
  },
  border: {
    default: "#E3DECF",
    hover: "#D3CCB8",
    light: "#EDE8DA",
    panel: "#E3DECF",
  },
  font: {
    primary: "#102B47",     // brand navy. 14.4:1 on white, AAA
    secondary: "#3E4C61",   // brand body slate, previously #474747
    tertiary: "#5E6A7D",    // >= 4.5:1 on cream, so it is usable for real text
    light: "#77818F",
    sectionLabel: "#77818F",
  },
  accent: {
    green: "#059669",
    red: "#dc2626",
    // Not the raw brand #2E9098: that is 3.78:1 on white and FAILS AA for text, and this token
    // is used as a text colour. #247A86 (the usual accessible substitute) clears white at 4.91
    // but only reaches 4.38 on the cream surface below -- so it is #21707B, which clears both
    // (5.01 on cream, 5.63 on white). Warming the background moved the bar; the test caught it.
    blue: "#21707B",
    purple: "#7c3aed",
    amber: "#d97706",
    orange: "#ea580c",
  },
  accentBg: {
    green: "rgba(16,185,129,0.08)",
    red: "rgba(239,68,68,0.08)",
    blue: "rgba(46,144,152,0.08)",
    purple: "rgba(139,92,246,0.08)",
    amber: "rgba(245,158,11,0.08)",
    orange: "rgba(249,115,22,0.08)",
    greenSubtle: "rgba(16,185,129,0.04)",
    blueSubtle: "rgba(46,144,152,0.04)",
    purpleSubtle: "rgba(139,92,246,0.04)",
    orangeSubtle: "rgba(249,115,22,0.04)",
  },
  accentBorder: {
    green: "rgba(16,185,129,0.20)",
    red: "rgba(239,68,68,0.20)",
    blue: "rgba(46,144,152,0.20)",
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
