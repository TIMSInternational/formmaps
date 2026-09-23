import { colorsLight } from "../colors";

/**
 * Contrast, computed rather than eyeballed.
 *
 * Two measured facts drove the light palette, and both are easy to undo by accident:
 *   - brand teal #2E9098 on white is 3.78:1, which FAILS WCAG AA for body text. It is used as a
 *     text colour, so `accent.blue` is #247A86 (4.9:1) instead.
 *   - navy #102B47 on white is 14.4:1, which is why it is the primary text colour.
 *
 * These tokens are load-bearing far beyond their own file: `admin-theme.css` remaps every
 * `bg-white` and `text-gray-*` utility onto them, so one edit here moves ~2,572 utilities. A
 * warmer palette that quietly drops a text pair below 4.5:1 would do that to the whole app at
 * once, on a product whose users include parents reading their child's assessment results.
 */

function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const channels = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const round = (n: number) => Math.round(n * 100) / 100;

describe("the contrast maths itself", () => {
  it("agrees with the known values this palette was chosen against", () => {
    expect({
      navyOnWhite: round(contrast("#102B47", "#FFFFFF")),
      brandTealOnWhite: round(contrast("#2E9098", "#FFFFFF")),
      blackOnWhite: round(contrast("#000000", "#FFFFFF")),
    }).toEqual({ navyOnWhite: 14.4, brandTealOnWhite: 3.78, blackOnWhite: 21 });
  });
});

describe("light palette text contrast", () => {
  const surfaces = [
    ["card", colorsLight.bg.card],
    ["panel", colorsLight.bg.panel],
    ["outer (the cream)", colorsLight.bg.outer],
    ["cardHover", colorsLight.bg.cardHover],
  ] as const;

  const bodyText = [
    ["font.primary", colorsLight.font.primary],
    ["font.secondary", colorsLight.font.secondary],
    ["font.tertiary", colorsLight.font.tertiary],
  ] as const;

  it.each(bodyText.flatMap(([tn, t]) => surfaces.map(([sn, s]) => [tn, t, sn, s] as const)))(
    "%s on %s clears AA for body text (4.5:1)",
    (_textName, text, _surfaceName, surface) => {
      expect(round(contrast(text, surface))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(surfaces)("accent.blue is readable as text on %s", (_name, surface) => {
    expect(round(contrast(colorsLight.accent.blue, surface))).toBeGreaterThanOrEqual(4.5);
  });

  it("does not use the raw brand teal for text, which fails AA", () => {
    expect(colorsLight.accent.blue.toUpperCase()).not.toBe("#2E9098");
  });

  it.each([
    ["font.light", colorsLight.font.light],
    ["font.sectionLabel", colorsLight.font.sectionLabel],
  ])("%s clears AA-large (3:1) on the card surface", (_name, text) => {
    expect(round(contrast(text, colorsLight.bg.card))).toBeGreaterThanOrEqual(3);
  });
});

describe("the palette is warm, not the grey it replaced", () => {
  /** Warm = red channel at or above blue. A neutral grey has them equal; #f0f0f0 is neutral. */
  const isWarm = (hex: string) => {
    const v = hex.replace("#", "");
    return parseInt(v.slice(0, 2), 16) >= parseInt(v.slice(4, 6), 16);
  };

  it.each([
    ["bg.outer", colorsLight.bg.outer],
    ["bg.card", colorsLight.bg.card],
    ["bg.cardHover", colorsLight.bg.cardHover],
    ["bg.iconBox", colorsLight.bg.iconBox],
    ["border.default", colorsLight.border.default],
    ["border.hover", colorsLight.border.hover],
    ["border.light", colorsLight.border.light],
  ])("%s is warm", (_name, hex) => {
    expect({ hex, warm: isWarm(hex) }).toEqual({ hex, warm: true });
  });

  it("keeps the brand cream as the outer surface", () => {
    expect(colorsLight.bg.outer.toUpperCase()).toBe("#F2F0E7");
  });
});
