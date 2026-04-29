// Generates CSS custom property declarations from token objects
// Prefix: --admin- (e.g., --admin-bg-outer, --admin-font-primary)

import { colorsDark, colorsLight, type AdminColors } from "./colors";
import { spacing, radius, layout } from "./spacing";
import { fontFamily, fontSize, fontWeight, letterSpacing } from "./typography";

function flattenObject(
  obj: Record<string, unknown>,
  prefix: string
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const varName = `${prefix}-${key}`;
    if (typeof value === "string") {
      result[varName] = value;
    } else if (typeof value === "object" && value !== null) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, varName));
    }
  }
  return result;
}

/** Generate flat CSS var map from color tokens */
export function generateColorVars(colors: AdminColors): Record<string, string> {
  return flattenObject(colors as unknown as Record<string, unknown>, "--admin");
}

/** Generate spacing CSS vars */
export function generateSpacingVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(spacing)) {
    vars[`--admin-space-${key}`] = value;
  }
  for (const [key, value] of Object.entries(radius)) {
    vars[`--admin-radius-${key}`] = value;
  }
  for (const [key, value] of Object.entries(layout)) {
    vars[`--admin-layout-${key}`] = value;
  }
  return vars;
}

/** Generate typography CSS vars */
export function generateTypographyVars(): Record<string, string> {
  const vars: Record<string, string> = { "--admin-font-family": fontFamily };
  for (const [key, value] of Object.entries(fontSize)) {
    vars[`--admin-font-size-${key}`] = value;
  }
  for (const [key, value] of Object.entries(fontWeight)) {
    vars[`--admin-font-weight-${key}`] = value;
  }
  for (const [key, value] of Object.entries(letterSpacing)) {
    vars[`--admin-tracking-${key}`] = value;
  }
  return vars;
}

/** Get all CSS vars for a theme mode */
export function getThemeVars(mode: "dark" | "light"): Record<string, string> {
  const colors = mode === "dark" ? colorsDark : colorsLight;
  return {
    ...generateColorVars(colors),
    ...generateSpacingVars(),
    ...generateTypographyVars(),
  };
}

/** Apply CSS vars to an element */
export function applyThemeVars(
  element: HTMLElement,
  mode: "dark" | "light"
): void {
  const vars = getThemeVars(mode);
  for (const [key, value] of Object.entries(vars)) {
    element.style.setProperty(key, value);
  }
}

/** Get shadcn CSS var overrides for admin theme */
export function getShadcnOverrides(mode: "dark" | "light"): Record<string, string> {
  const c = mode === "dark" ? colorsDark : colorsLight;
  return {
    "--background": c.bg.panel,
    "--foreground": c.font.primary,
    "--card": c.bg.panel,
    "--card-foreground": c.font.primary,
    "--popover": c.bg.card,
    "--popover-foreground": c.font.primary,
    "--primary": c.font.primary,
    "--primary-foreground": c.bg.panel,
    "--secondary": mode === "dark" ? "#222" : "#f0f0f0",
    "--secondary-foreground": c.font.secondary,
    "--muted": mode === "dark" ? "#222" : "#f0f0f0",
    "--muted-foreground": c.font.tertiary,
    "--accent": c.bg.hover,
    "--accent-foreground": c.font.primary,
    "--destructive": c.accent.red,
    "--border": c.border.panel,
    "--input": c.border.panel,
    "--ring": c.font.light,
  };
}
