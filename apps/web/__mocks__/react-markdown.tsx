import React from "react";

/**
 * Lightweight jest mock for react-markdown (which ships pure-ESM and can't be
 * parsed by ts-jest). Handles the markdown subset the app relies on — ATX
 * headings (#), bold (**), and bullet lists (-) — routing each through the
 * caller-supplied `components` map so component styling is exercised too.
 * This lets tests verify markdown is RENDERED (not shown as literal text).
 */
type Components = Record<string, React.ComponentType<{ children?: React.ReactNode; href?: string }>>;

function renderInline(text: string, C: Components, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const Strong = C.strong || (("strong" as unknown) as Components[string]);
    parts.push(<Strong key={`${keyPrefix}-s${i++}`}>{m[1]}</Strong>);
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function ReactMarkdown({
  children,
  components = {},
}: {
  children?: string;
  components?: Components;
  remarkPlugins?: unknown[];
}) {
  const source = typeof children === "string" ? children : "";
  const blocks = source.split(/\n{2,}/).filter((b) => b.trim().length > 0);
  const out: React.ReactNode[] = [];

  blocks.forEach((block, bi) => {
    const lines = block.split("\n");
    // Heading
    const headingMatch = lines[0].match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch && lines.length === 1) {
      const level = headingMatch[1].length;
      const tag = `h${level}`;
      const H = components[tag] || ((tag as unknown) as Components[string]);
      out.push(<H key={`b${bi}`}>{renderInline(headingMatch[2], components, `b${bi}`)}</H>);
      return;
    }
    // Bullet list
    if (lines.every((l) => /^[-*]\s+/.test(l.trim()))) {
      const Ul = components.ul || (("ul" as unknown) as Components[string]);
      const Li = components.li || (("li" as unknown) as Components[string]);
      out.push(
        <Ul key={`b${bi}`}>
          {lines.map((l, li) => (
            <Li key={`b${bi}-l${li}`}>{renderInline(l.trim().replace(/^[-*]\s+/, ""), components, `b${bi}-l${li}`)}</Li>
          ))}
        </Ul>
      );
      return;
    }
    // Paragraph
    const P = components.p || (("p" as unknown) as Components[string]);
    out.push(<P key={`b${bi}`}>{renderInline(block, components, `b${bi}`)}</P>);
  });

  return <>{out}</>;
}
