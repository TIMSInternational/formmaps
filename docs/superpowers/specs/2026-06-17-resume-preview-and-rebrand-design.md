# Resume preview & builder rebrand — Design

**Date:** 2026-06-17
**Branch:** `fix/resume-preview-and-rebrand` (off `develop`)
**Scope:** Frontend-only. No API change, no migration.

Three tasks on the resume flow. The uploaded document — not a parse — must be what the
user sees; the original-document preview must render inline; and the builder page must
match the current FormMaps brand UI.

---

## Task B — Unblock the original-document preview (CSP)

**Problem:** The builder "Original" pane (`resume-builder/_components/ResumePreviewWithToggle.tsx:66`)
loads `<iframe src={url}>` where `url` is a **presigned S3 URL** returned by
`GET /api/resume/:id/original` (`resumeService.getOriginalUrl` → `s3.ts getFileUrl`, which
already sets `ResponseContentDisposition: inline` + `application/pdf`). Chrome blocks it
("This content is blocked") because `next.config.ts` CSP `frame-src` lists only `'self'`,
timshr, daily — **no S3 host**.

**Fix:** `frontend/next.config.ts` — add `https://*.amazonaws.com` to **two** directives:
- `frame-src` (line 115) → the iframe renders the inline PDF.
- `connect-src` (line 114) → pdf.js (Task C) can `fetch()` the PDF bytes over XHR.

Mirrors the trust already granted in `img-src` (`https://*.amazonaws.com`). One-file change.

**Verify:** Original pane shows the real PDF (no "blocked" message).

---

## Task C — List card shows the ACTUAL uploaded document

**Problem:** `resumes/_components/ResumeCard.tsx:40-81` renders a Times-New-Roman **typeset
of the parsed fields** (name/summary/experience/skills) — a fabricated mini-resume, not the
uploaded file. The parse (`POST /api/resume/upload-and-parse`) is for data extraction only,
never the displayed artifact.

**Fix:**
- Add **`pdfjs-dist`** to `frontend/package.json` (verify exact version exists on npm).
- New `resumes/_components/ResumeOriginalThumbnail.tsx`:
  - Props: `resumeId: string`, `fallback: React.ReactNode`.
  - Lazy via `IntersectionObserver` — only fetch/render when the card scrolls into view
    (a list of N cards must not fire N presigns + N renders at once).
  - On view: `getOriginalUrl(resumeId)` → load with pdfjs-dist → render **page 1 to a
    `<canvas>`** scaled to the card preview area (`h-48`).
  - States: loading skeleton; on error or null URL → render `fallback`.
  - pdf.js worker bundled from `node_modules`, served same-origin (`worker-src` inherits
    `default-src 'self'`). Set `GlobalWorkerOptions.workerSrc` via
    `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)`.
- `ResumeCard.tsx`: if `resume.hasOriginal` → render `<ResumeOriginalThumbnail resumeId={resume._id} fallback={<typeset block>} />`; else render the existing typeset block directly. Keep the template badge, hover overlay, "Original" pill, info, and menu unchanged.

The builder "Original" pane (the `ResumePreviewWithToggle` iframe) is unchanged — it already
points at the stored original and works the moment B lands.

**Verify:** A resume with `hasOriginal` shows a real page-1 thumbnail; one without falls
back to the typeset preview.

---

## Task A — Brand rebrand of the resume-builder page (chrome + all sub-editors)

**Purely presentational.** Props, handlers, state, and DOM structure stay identical — only
classes/colors change. Functionality must remain bit-for-bit.

**Brand system** (match `subscribe/page.tsx`, `payment-success/page.tsx`, login redesigns):
- Brand blue `#065292`: primary buttons, active tabs/states, links, avatars, key icons.
  Use Tailwind arbitrary values (`bg-[#065292]`, `text-[#065292]`, `border-[#065292]`) —
  consistent with existing resume code (`ResumeCard.tsx` already uses `bg-[#065292]`).
- Yellow `#FFD600`: accent pills/badges/highlights (text on yellow = `#111111`).
- Headings/body `#111111` (or `text-foreground`); surfaces `bg-card`/`bg-white`,
  `border-border`, `var(--admin-*)`; muted `text-muted-foreground`.
- Poppins (already the app font); rounded-xl/2xl cards, `shadow-sm`/`shadow-md` on hover.
- **Replace** hardcoded `bg-gray-900`, `bg-foreground`(black), `text-gray-500`,
  `bg-gray-50`, black CTAs with the brand tokens above.

**Files (9):**
- `resume-builder/[id]/page.tsx` — shell: Download bar (currently black → brand blue),
  AI-Rewrite empty-state CTA (black → brand), Editor/Style tab content, template cards,
  Add-Section button, save toast.
- `resume-builder/_components/ResumeTabSwitcher.tsx` — active tab → brand blue.
- `resume-builder/_components/ResumePreviewPanel.tsx` — toolbar, Sample Data button.
- `resume-builder/_components/PersonalInfoEditor.tsx`
- `resume-builder/_components/SkillsEditor.tsx`
- `resume-builder/_components/EducationEditor.tsx`
- `resume-builder/_components/ExperienceEditor.tsx`
- `resume-builder/_components/SortableSection.tsx`
- `resume-builder/_components/ResumeModals.tsx`

**Out of scope:** layout restructure, component splitting (page.tsx stays >400 LOC for now),
behavior changes. Pure rebrand per user's decision.

---

## Verification & deploy

- `cd frontend && npx tsc --noEmit` (0 errors).
- `cd frontend && npx jest` — extend `ResumeCard.original-badge.test.tsx` /
  `ResumePreviewWithToggle.test.tsx`; add a `ResumeOriginalThumbnail` fallback test.
- **Playwright live as `test.student`** (school student → bypasses `requireSubscription`):
  Original pane renders the PDF (no "blocked"); list card shows the real thumbnail; walk the
  rebranded builder (tabs, editors, Download bar) — functionality intact.
- **Independent test pass via the codex plugin** (`codex exec` / `/codex:review`) over the diff.
- **Deploy:** frontend-only → PR `fix/...` → `develop` (gh pr merge) → `develop`→`main` →
  `vercel --prod --yes` from repo root. Rollback = Vercel redeploy previous build. No App
  Runner / migration.
