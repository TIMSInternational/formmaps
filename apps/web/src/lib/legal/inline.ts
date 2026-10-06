/** Tokeniser for the two inline marks legal content may use (see types.ts). Pure, so it is unit-tested. */
export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "link"; text: string; href: string };

const INLINE_RE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(input: string): InlineToken[] {
  const out: InlineToken[] = [];
  let last = 0;
  for (const m of input.matchAll(INLINE_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: input.slice(last, at) });
    if (m[1] !== undefined) out.push({ kind: "bold", text: m[1] });
    else out.push({ kind: "link", text: m[2], href: m[3] });
    last = at + m[0].length;
  }
  if (last < input.length) out.push({ kind: "text", text: input.slice(last) });
  return out;
}

/** Internal app paths open in-app; everything else (https, mailto) is external. */
export function isExternalHref(href: string): boolean {
  return !href.startsWith("/") && !href.startsWith("#");
}

/**
 * i18n strings for consent labels mark links as <name>label</name> (i18next leaves tags alone).
 * Returns text and tagged pieces; tags with no matching close are left as text.
 */
export type TaggedToken = { kind: "text"; text: string } | { kind: "tag"; tag: string; text: string };

export function parseTagged(input: string): TaggedToken[] {
  const out: TaggedToken[] = [];
  const re = /<([a-zA-Z]+)>([^<]*)<\/\1>/g;
  let last = 0;
  for (const m of input.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: input.slice(last, at) });
    out.push({ kind: "tag", tag: m[1], text: m[2] });
    last = at + m[0].length;
  }
  if (last < input.length) out.push({ kind: "text", text: input.slice(last) });
  return out;
}
