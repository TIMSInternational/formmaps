// Typography tokens — Twenty CRM style

export const fontFamily = "Inter, -apple-system, system-ui, sans-serif";

export const fontSize = {
  xs: "10px",
  sm: "11px",
  base: "13px",
  md: "14px",
  lg: "16px",
  xl: "20px",
  "2xl": "24px",
} as const;

export const fontWeight = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const lineHeight = {
  tight: "1.2",
  normal: "1.5",
  relaxed: "1.625",
} as const;

export const letterSpacing = {
  tight: "-0.02em",
  normal: "0",
  wide: "0.06em",
  wider: "0.08em",
} as const;
