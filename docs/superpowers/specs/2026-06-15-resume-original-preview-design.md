# Faithful Original Document Preview — Design Spec

**Date:** 2026-06-15
**Status:** Approved (design); pending implementation plan
**Area:** Resume builder — document upload & preview

## Problem

When a user uploads a resume document, the app immediately AI-parses it, discards
the original file, and re-renders the extracted content through the app's own
resume template. The preview therefore shows a **reformatted** version, not the
document the user submitted. The original formatting/layout is lost.

The user's requirement: uploading a document should **preserve the original
format**. The preview must show the document **as submitted**, untouched. The app
should "just receive the format" — not rewrite it. Editing should remain possible,
but as a separate action that never mutates the original.

## Decisions (locked during brainstorming)

1. **Upload outcome:** original preview **plus** optional editing. Two
   representations are kept — the faithful original and an editable structured copy.
2. **Format fidelity:** PDF is shown pixel-faithful as-is. DOCX is converted to PDF
   server-side and that PDF is shown faithfully.
3. **Original vs edits:** the uploaded file is stored **immutable** and always
   available as the "Original" preview. Edits live in a separate editable copy. The
   preview offers an **Original / Edited toggle**. Editing never changes the original.
4. **DOCX→PDF conversion:** runs via **LibreOffice headless inside the API
   container** (`node:20-slim` + `libreoffice-writer`). The resulting PDF is cached
   in S3 so each document converts only once. No third-party service (student
   documents stay in our infra).

## Architecture

### Data model (additive migration — no data loss)

`Resume` (api/prisma/schema.prisma) gains:

| Field | Type | Meaning |
|-------|------|---------|
| `originalFileKey` | `String?` | S3 key of the uploaded file (the true original) |
| `originalFileType` | `String?` | `"pdf"` or `"docx"` (source type) |
| `originalPdfKey` | `String?` | S3 key of the faithful-preview PDF (== `originalFileKey` when upload was already a PDF) |
| `hasOriginal` | `Boolean @default(false)` | whether a faithful original/preview exists |

Existing structured fields (`personalInfo`, `experience`, `education`, `skills`,
`sections`, …) remain and are the **Edited** copy. Migration is purely additive.

### Storage

- Private S3 objects (bucket already configured: `S3_BUCKET=nexa-platform-uploads`)
  under `resumes/{userId}/{resumeId}/original.{ext}` and `.../preview.pdf`.
- Reuse `api/src/lib/s3.ts` (already has `PutObjectCommand` + delete). Add one
  helper `getSignedDownloadUrl(key, ttlSeconds)` using `@aws-sdk/s3-request-presigner`
  (already a dependency).
- Objects stay **private**; never served directly. Access only through
  ownership-checked, short-TTL signed URLs.

### Backend

**`POST /api/resume/upload-and-parse` (modify, api/src/routes/resume.ts):**
1. Receive the file buffer (existing multer in-memory upload, 5 MB limit).
2. Upload the original buffer to S3 → `originalFileKey`, `originalFileType`.
3. If PDF → `originalPdfKey = originalFileKey`. If DOCX → `convertDocxToPdf(buffer)`
   → upload `preview.pdf` → `originalPdfKey`.
4. Keep the existing AI extraction → structured fields (the Edited copy).
5. `prisma.resume.create(...)` with structured fields **and** the new key fields
   (`hasOriginal = true` when a preview PDF exists).

**New `GET /api/resume/:id/original` (api/src/routes/resume.ts):**
- `authenticate` + ownership via `canAccessUser` (same pattern as `GET /:id`).
- Returns `{ success: true, data: { url } }` where `url` is a short-TTL signed S3
  URL to `originalPdfKey`. 404 (`Not found`) when not owner or no original.

**`api/src/lib/docxToPdf.ts` (new, isolated, testable):**
- `convertDocxToPdf(buffer: Buffer): Promise<Buffer>` — spawns
  `soffice --headless --convert-to pdf --outdir <tmp>` with `HOME=/tmp` (LibreOffice
  needs a writable profile dir), reads back the produced PDF.
- Designed as an **injectable boundary** so the upload route can be unit-tested
  with the converter mocked (CI/jest has no LibreOffice).

**Dockerfile (api/Dockerfile):**
- Base image `node:20-alpine` → `node:20-slim` (Debian; alpine + LibreOffice is
  impractical).
- `apt-get install -y --no-install-recommends libreoffice-writer fonts-liberation`
  then clean apt lists. (writer is sufficient for .docx → .pdf.)

### Frontend

- **Preview surface:** the toggle lives in the resume builder's preview panel
  (`frontend/src/app/dashboard/resume-builder/_components/ResumePreviewPanel.tsx` /
  `ResumePreview.tsx`); the resumes list card (`ResumeCard.tsx`) gets a small
  "Original" badge when `hasOriginal`. Exact component wiring confirmed during planning.
- **Preview component** gains an **Original | Edited** toggle:
  - *Original* → `getOriginalUrl(id)` → render the signed PDF read-only via PDF.js /
    `<iframe>`. View/download only.
  - *Edited* → existing template render of the structured data.
  - Default tab = **Original** when `hasOriginal`, else **Edited**.
- **Upload flow:** after upload, land on the **Original** preview (no auto-jump into
  the templated editor). An explicit **Edit** action enters the builder (Edited copy).
- `resumeService.getOriginalUrl(id)`; `Resume` type gains `originalFileType` /
  `hasOriginal`.

## Error handling

- **DOCX conversion failure:** keep the stored original (`originalFileKey` set, so
  it stays downloadable) + the AI extraction; leave `originalPdfKey` null and
  `hasOriginal = false` (no faithful embeddable preview). With `hasOriginal = false`
  the default tab is **Edited**; the Original tab still appears but shows
  "Faithful preview unavailable for this file — showing the extracted version" plus a
  download link to the stored original, rather than an embedded PDF. So
  `hasOriginal` specifically gates *embeddable faithful preview*, while
  `originalFileKey` gates *download availability*.
- **S3 upload failure:** fail the request loudly with a generic error — never
  silently drop the file.
- **Signed URLs:** short TTL (≈5 min), regenerated on demand.

## Security

- All resume documents are private S3 objects (student PII). Access only via
  ownership-checked signed URLs. No public bucket exposure.
- Sanitize the uploaded filename before composing the S3 key.
- `GET /:id/original` uses the existing `canAccessUser` check; returns 404 (not 403)
  for non-owners to avoid existence oracles (matches project IDOR convention).

## Testing (TDD)

- **`docxToPdf`**: fixture `.docx` → non-empty PDF buffer. Integration test gated on
  `soffice` presence; unit tests of the route mock the converter boundary.
- **`upload-and-parse`**: stores `originalFileKey`/`originalPdfKey`/`hasOriginal`;
  survives a conversion failure (mocked) without losing the original or extraction.
- **`GET /:id/original`**: returns a signed URL for the owner; 404 for a non-owner.
- **Frontend preview**: toggle renders Original (iframe `src` from `getOriginalUrl`)
  vs Edited; default-tab logic (`hasOriginal` → Original).

## Deployment & risks

- **Main risk:** the Dockerfile base-image change (`alpine` → `slim` + LibreOffice,
  ~+400–600 MB). Larger image, slower cold start, and DOCX conversion is
  memory/CPU-spiky on the App Runner instance. Conversion is one-shot at upload and
  cached (resulting PDF stored in S3), which bounds the cost.
- **Migration:** additive `Resume` columns, applied in-VPC via the established
  Fargate drill at deploy.
- **Redeploy:** bigger API image to ECR + App Runner; frontend to Vercel.
- App Runner instance role must allow `s3:PutObject`/`s3:GetObject` on the bucket
  (verify; the app already uses S3 for other uploads).

## Out of scope

- Editing the original file's bytes (it is immutable by design).
- Pixel-faithful in-browser DOCX rendering without conversion.
- Re-architecting the existing structured editor (covered separately; note the
  prior save-contract fix via `resumeSerialization.ts`).
