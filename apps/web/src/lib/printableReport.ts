// Shared printable-report helper. Opens a self-contained, branded HTML document in a
// new window and triggers the browser print dialog (Save as PDF). Used by the
// school-admin reports page and the assessments results report viewer.
//
// `title` and `studentName` are escaped here. Each section's `content` is raw HTML by
// design (callers build their own tables) — callers MUST escape any dynamic values they
// interpolate with `escapeHtml` to avoid HTML injection in the printable window.

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface PrintableSection {
  heading: string;
  content: string;
}

export function openPrintableReport(title: string, studentName: string, sections: PrintableSection[]) {
  const safeTitle = escapeHtml(title);
  const safeName = escapeHtml(studentName);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle} — ${safeName}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 24px 0 12px; color: #555; border-bottom: 1px solid #eee; padding-bottom: 6px; }
  .meta { font-size: 13px; color: #888; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; } th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
  th { font-weight: 600; color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .bar-container { display: inline-block; width: 60px; height: 8px; background: #f0f0f0; border-radius: 4px; vertical-align: middle; margin-left: 8px; }
  .bar { height: 100%; border-radius: 4px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  @media print { body { margin: 20px; } }
</style></head><body>
<h1>${safeTitle}</h1>
<div class="meta">${safeName} · Generated ${escapeHtml(new Date().toLocaleDateString())}</div>
${sections.map(s => `<h2>${escapeHtml(s.heading)}</h2>${s.content}`).join("")}
<script>window.print();</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}
