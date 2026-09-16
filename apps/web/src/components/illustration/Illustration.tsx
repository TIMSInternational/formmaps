"use client";

import { cn } from "@/lib/utils";

/**
 * The FormMaps illustration set.
 *
 * Flat geometric marks in the brand palette — deep teal #2E9098, golden yellow
 * #FFD23F, mid grey #8A93A3 — built from the same vocabulary as the marks drawn
 * in the PDF informe (arcs from a common origin, dots on a grid, nodes joined by
 * paths, a set of shapes with one picked out), so the report and the product
 * read as one thing rather than two.
 *
 * Two constraints the set is built to, both learned the hard way:
 *
 *   - **No navy, no black, no white fills.** The app themes with a `.dark`
 *     class, and a single asset has to survive both grounds. Navy #102B47 on
 *     #0A0A0A is invisible; an opaque white ground is a white box on a dark
 *     dashboard. Every asset here is verified to carry 0% dark-unsafe ink and a
 *     genuinely transparent background.
 *   - **No soft interior fills.** A faint fill inside a shape survives the
 *     cutout as a grey halo.
 *
 * Masters live beside the served files in `_masters/` at 2048px; the `.webp`
 * pair is 320 (1x–2x) and 640 (3x).
 */
export type IllustrationName =
  | "completed"
  | "journey"
  | "not-started"
  | "no-results"
  | "no-data"
  | "locked"
  | "connection-lost"
  | "already-done";

interface IllustrationProps {
  name: IllustrationName;
  /** Rendered edge length in px. The art is square with its own margin. */
  size?: number;
  className?: string;
  /**
   * Only pass this when the illustration is the ONLY thing carrying the
   * meaning. Beside a heading it is decoration, and a screen reader announcing
   * it just repeats the heading — so it is `aria-hidden` by default.
   */
  alt?: string;
  priority?: boolean;
}

const BASE = "/assets/illustrations";

export function Illustration({
  name,
  size = 160,
  className,
  alt,
  priority = false,
}: IllustrationProps) {
  const decorative = alt === undefined;

  return (
    // A plain img, not next/image: the webp pair is pre-sized at exactly the two
    // widths used here, so the Next optimiser would only re-encode an already
    // optimised asset. (The repo has @next/next/no-img-element off.)
    <img
      src={`${BASE}/${name}@320.webp`}
      srcSet={`${BASE}/${name}@320.webp 320w, ${BASE}/${name}@640.webp 640w`}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt={decorative ? "" : alt}
      aria-hidden={decorative || undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={cn("select-none", className)}
      style={{ width: size, height: size }}
    />
  );
}
