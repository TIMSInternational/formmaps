# Faithful Original Document Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user uploads a resume document, store the original file and show it untouched in the preview (PDF as-is; DOCX converted to PDF), with an Original/Edited toggle. Editing never mutates the original.

**Architecture:** Originals are stored as private S3 objects via the existing `api/src/lib/s3.ts`. DOCX is converted to PDF by LibreOffice headless inside the API container (an isolated, dependency-injectable `lib/docxToPdf.ts`). New `Resume` columns track the keys. A new ownership-checked endpoint returns a short-TTL signed URL. The frontend preview gains an Original/Edited toggle; the original is read-only.

**Tech Stack:** Express + Prisma + Postgres, `@aws-sdk/client-s3` (+ presigner), LibreOffice (`soffice`), Next.js/React, vitest + supertest (API), jest + React Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-06-15-resume-original-preview-design.md`

---

## File Structure

**Backend (api/):**
- `prisma/schema.prisma` — modify `Resume` model (4 additive columns).
- `prisma/migrations/<ts>_resume_original_fields/migration.sql` — new additive migration.
- `src/lib/docxToPdf.ts` — **new**: `convertDocxToPdf(buffer, run?)` (injectable soffice runner).
- `src/routes/resume.ts` — modify `POST /upload-and-parse`; add `GET /:id/original`.
- `Dockerfile` — base `node:20-alpine` → `node:20-slim` + LibreOffice.
- `src/__tests__/docx-to-pdf.unit.test.ts`, `src/__tests__/resume-original.test.ts` — **new** tests.

**Frontend (frontend/):**
- `src/services/resumeService.ts` — add `originalFileType?`/`hasOriginal?` to `Resume`; add `getOriginalUrl()`.
- `src/services/resumeSerialization.ts` — `ApiResumePayload` + `fromApiResume` carry the new fields.
- `src/app/dashboard/resume-builder/_components/ResumePreviewWithToggle.tsx` — **new** Original/Edited toggle.
- `src/app/dashboard/resumes/_components/ResumeCard.tsx` — "Original" badge.
- co-located `__tests__` for the serializer + toggle + card.

---

## Task 1: Add original-file columns to the Resume model

**Files:**
- Modify: `api/prisma/schema.prisma` (Resume model, ~line 1081)
- Create: `api/prisma/migrations/<timestamp>_resume_original_fields/migration.sql`

- [ ] **Step 1: Add the columns to the schema**

In `api/prisma/schema.prisma`, inside `model Resume { ... }`, after the `customFields` line add:

```prisma
  originalFileKey  String?
  originalFileType String?
  originalPdfKey   String?
  hasOriginal      Boolean  @default(false)
```

- [ ] **Step 2: Format + regenerate the client**

Run: `cd api && npx prisma format && npx prisma generate`
Expected: "Generated Prisma Client" with no schema errors.

- [ ] **Step 3: Author the migration SQL (additive, prod-safe)**

Create `api/prisma/migrations/20260615_resume_original_fields/migration.sql` (use the real current timestamp prefix `YYYYMMDDHHMMSS`):

```sql
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "originalFileKey" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "originalFileType" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "originalPdfKey" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "hasOriginal" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 4: Apply to dev**

Run (dev DB is push-based; additive columns are safe):
`cd api && npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema." No data-loss prompt (additive only — do NOT pass `--accept-data-loss`).

- [ ] **Step 5: Verify columns exist + types compile**

Run: `cd api && npx tsc --noEmit`
Expected: no errors (the generated client now includes the new fields).

- [ ] **Step 6: Commit**

```bash
git add api/prisma/schema.prisma api/prisma/migrations
git commit -m "feat(resume): add original-file columns to Resume (additive)"
```

---

## Task 2: DOCX→PDF converter (`lib/docxToPdf.ts`)

**Files:**
- Create: `api/src/lib/docxToPdf.ts`
- Test: `api/src/__tests__/docx-to-pdf.unit.test.ts`

The converter is designed with an **injectable runner** so its temp-file orchestration is unit-testable without LibreOffice installed.

- [ ] **Step 1: Write the failing test**

Create `api/src/__tests__/docx-to-pdf.unit.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { convertDocxToPdf, type SofficeRunner } from "../lib/docxToPdf.js";

describe("convertDocxToPdf", () => {
  it("writes the input, runs the converter into the temp dir, and returns the produced PDF bytes", async () => {
    let receivedArgs: string[] = [];
    // Fake runner: emulate soffice by writing input.pdf next to input.docx.
    const fakeRunner: SofficeRunner = async (args, { dir }) => {
      receivedArgs = args;
      await writeFile(join(dir, "input.pdf"), Buffer.from("%PDF-1.7 fake"));
    };

    const out = await convertDocxToPdf(Buffer.from("docx-bytes"), fakeRunner);

    expect(out.toString()).toBe("%PDF-1.7 fake");
    expect(receivedArgs).toContain("--headless");
    expect(receivedArgs).toContain("pdf");
  });

  it("throws when the converter produces no PDF", async () => {
    const noopRunner: SofficeRunner = async () => {
      /* produce nothing */
    };
    await expect(convertDocxToPdf(Buffer.from("x"), noopRunner)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/__tests__/docx-to-pdf.unit.test.ts`
Expected: FAIL — cannot find module `../lib/docxToPdf.js`.

- [ ] **Step 3: Write the implementation**

Create `api/src/lib/docxToPdf.ts`:

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export type SofficeRunner = (
  args: string[],
  ctx: { dir: string },
) => Promise<void>;

// Default runner shells out to LibreOffice headless. HOME must be writable —
// soffice creates a profile dir on first run.
const defaultRunner: SofficeRunner = async (args) => {
  await execFileAsync("soffice", args, {
    env: { ...process.env, HOME: "/tmp" },
    timeout: 60_000,
    maxBuffer: 1024 * 1024 * 32,
  });
};

/** Convert a .docx buffer to a PDF buffer. Throws if conversion produces no PDF. */
export async function convertDocxToPdf(
  buffer: Buffer,
  run: SofficeRunner = defaultRunner,
): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "docx2pdf-"));
  try {
    const inputPath = join(dir, "input.docx");
    await writeFile(inputPath, buffer);
    await run(
      ["--headless", "--convert-to", "pdf", "--outdir", dir, inputPath],
      { dir },
    );
    return await readFile(join(dir, "input.pdf"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/__tests__/docx-to-pdf.unit.test.ts`
Expected: PASS (2 tests). The second test passes because `readFile` of a non-existent `input.pdf` rejects.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/docxToPdf.ts api/src/__tests__/docx-to-pdf.unit.test.ts
git commit -m "feat(resume): add injectable DOCX->PDF converter (lib/docxToPdf)"
```

---

## Task 3: Add LibreOffice to the API image

**Files:**
- Modify: `api/Dockerfile`

- [ ] **Step 1: Rewrite the Dockerfile on a Debian base with LibreOffice**

Replace the entire contents of `api/Dockerfile` with:

```dockerfile
FROM node:20-slim
WORKDIR /app
# LibreOffice (writer is enough for .docx -> .pdf) + base fonts for faithful output.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer fonts-liberation \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npm install tsx prisma
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
COPY data ./data
COPY scripts ./scripts
ENV NODE_ENV=production
# soffice needs a writable HOME for its profile dir.
ENV HOME=/tmp
EXPOSE 3001
CMD ["npx", "tsx", "src/index.ts"]
```

- [ ] **Step 2: Verify the image builds and soffice is present**

Run (heavy — ~400–600MB image; do once locally):
```bash
cd api && docker build -t nexa-api-libreoffice-check . \
  && docker run --rm nexa-api-libreoffice-check sh -c "soffice --version"
```
Expected: build succeeds and prints a `LibreOffice <version>` line.

- [ ] **Step 3: Commit**

```bash
git add api/Dockerfile
git commit -m "build(api): node:20-slim base + LibreOffice for DOCX->PDF conversion"
```

---

## Task 4: Store the original (and converted PDF) on upload

**Files:**
- Modify: `api/src/routes/resume.ts` (`POST /upload-and-parse`, ~line 306)
- Test: `api/src/__tests__/resume-original.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/src/__tests__/resume-original.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { studentToken } from "./setup.js";

const resumeCreate = vi.fn();
const resumeFindFirst = vi.fn();

vi.mock("../lib/prisma.js", () => {
  const p: any = {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    $disconnect: vi.fn(),
    resume: { create: resumeCreate, findFirst: resumeFindFirst, findUnique: vi.fn() },
  };
  return { prisma: p, basePrisma: p };
});

vi.mock("../lib/s3.js", () => ({
  uploadFile: vi.fn().mockResolvedValue("s3://bucket/key"),
  getFileUrl: vi.fn().mockResolvedValue("https://signed.example/preview.pdf"),
}));

vi.mock("../lib/docxToPdf.js", () => ({
  convertDocxToPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF converted")),
}));

// AI extraction returns a minimal structured resume.
vi.mock("../lib/bedrock.js", () => ({
  aiJson: vi.fn().mockResolvedValue({
    personalInfo: { name: "Jane", email: "j@x.com" },
    experience: [], education: [], skills: ["React"], summary: "S", projects: [],
    languages: [], certifications: [],
  }),
  aiChat: vi.fn(),
}));

let app: any;
beforeAll(async () => { app = (await import("../index.js")).app; }, 30000);

const student = studentToken("s1");

beforeEach(() => {
  vi.clearAllMocks();
  resumeCreate.mockResolvedValue({ id: "r1" });
});

describe("POST /api/resume/upload-and-parse stores the original", () => {
  it("for a PDF, stores the file and sets originalPdfKey = originalFileKey, hasOriginal=true", async () => {
    await request(app)
      .post("/api/resume/upload-and-parse")
      .set("Authorization", `Bearer ${student}`)
      .attach("file", Buffer.from("%PDF-1.7 hello"), "resume.pdf")
      .expect(200);

    expect(resumeCreate).toHaveBeenCalledTimes(1);
    const data = resumeCreate.mock.calls[0][0].data;
    expect(data.hasOriginal).toBe(true);
    expect(data.originalFileType).toBe("pdf");
    expect(typeof data.originalFileKey).toBe("string");
    expect(data.originalPdfKey).toBe(data.originalFileKey);
  });

  it("for a DOCX, converts to PDF and stores a distinct preview key", async () => {
    const { convertDocxToPdf } = await import("../lib/docxToPdf.js");
    await request(app)
      .post("/api/resume/upload-and-parse")
      .set("Authorization", `Bearer ${student}`)
      .attach("file", Buffer.from("PK docx-bytes"), "resume.docx")
      .expect(200);

    expect(convertDocxToPdf).toHaveBeenCalledTimes(1);
    const data = resumeCreate.mock.calls[0][0].data;
    expect(data.originalFileType).toBe("docx");
    expect(data.hasOriginal).toBe(true);
    expect(data.originalPdfKey).not.toBe(data.originalFileKey);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/__tests__/resume-original.test.ts`
Expected: FAIL — `resumeCreate` called without `hasOriginal`/`originalFileKey` (current route doesn't store them).

- [ ] **Step 3: Modify the upload route**

In `api/src/routes/resume.ts`, add imports near the top (after the existing imports):

```typescript
import { uploadFile, getFileUrl } from "../lib/s3.js";
import { convertDocxToPdf } from "../lib/docxToPdf.js";
import { randomUUID } from "node:crypto";
```

Then, inside `router.post("/upload-and-parse", ...)`, AFTER `content` has been extracted and validated (after the `if (!content ...) { return; }` guard) and BEFORE `prisma.resume.create(...)`, insert:

```typescript
    // Store the original file untouched, and a faithful-preview PDF.
    const ext = (file?.originalname || filename || "").toLowerCase().split(".").pop();
    const fileType = ext === "pdf" ? "pdf" : ext === "docx" || ext === "doc" ? "docx" : "other";
    const resumeId = randomUUID();
    let originalFileKey: string | null = null;
    let originalPdfKey: string | null = null;
    let hasOriginal = false;

    if (file?.buffer && (fileType === "pdf" || fileType === "docx")) {
      originalFileKey = `resumes/${req.userId}/${resumeId}/original.${fileType}`;
      await uploadFile(
        originalFileKey,
        file.buffer,
        fileType === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      if (fileType === "pdf") {
        originalPdfKey = originalFileKey;
        hasOriginal = true;
      } else {
        try {
          const pdf = await convertDocxToPdf(file.buffer);
          originalPdfKey = `resumes/${req.userId}/${resumeId}/preview.pdf`;
          await uploadFile(originalPdfKey, pdf, "application/pdf");
          hasOriginal = true;
        } catch (convErr) {
          // Keep the stored original (downloadable); no embeddable faithful preview.
          logger.error(convErr, "DOCX->PDF conversion failed");
          originalPdfKey = null;
          hasOriginal = false;
        }
      }
    }
```

Then change the `prisma.resume.create({ data: { ... } })` call to include the new fields and the chosen `id`:

```typescript
    const resume = await prisma.resume.create({
      data: {
        id: resumeId,
        userId: req.userId!,
        name: filename.replace(/\.[^.]+$/, ""),
        personalInfo: JSON.parse(JSON.stringify(result.personalInfo ?? {})),
        experience: JSON.parse(JSON.stringify(result.experience ?? [])),
        education: JSON.parse(JSON.stringify(result.education ?? [])),
        skills: JSON.parse(JSON.stringify((result.skills ?? []).map((s: string) => ({ name: s })))),
        sections: JSON.parse(JSON.stringify(sections)),
        customFields: JSON.parse(JSON.stringify([{ key: "rawContent", value: truncated }])),
        originalFileKey,
        originalFileType: fileType,
        originalPdfKey,
        hasOriginal,
      },
    });
```

(`getFileUrl` import is used in Task 5; it is harmless to import here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/__tests__/resume-original.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify nothing else broke + types**

Run: `cd api && npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/resume.ts api/src/__tests__/resume-original.test.ts
git commit -m "feat(resume): store original + converted-PDF on upload"
```

---

## Task 5: `GET /api/resume/:id/original` (signed-URL endpoint)

**Files:**
- Modify: `api/src/routes/resume.ts` (add route near the other `/:id` GETs, ~line 65)
- Test: append to `api/src/__tests__/resume-original.test.ts`

- [ ] **Step 1: Write the failing test (append to the same file)**

Add to `api/src/__tests__/resume-original.test.ts`:

```typescript
describe("GET /api/resume/:id/original", () => {
  it("returns a signed URL for the owner", async () => {
    resumeFindFirst.mockResolvedValue({
      id: "r1", userId: "test-student-id", isActive: true,
      originalPdfKey: "resumes/test-student-id/r1/preview.pdf",
    });
    const res = await request(app)
      .get("/api/resume/r1/original")
      .set("Authorization", `Bearer ${student}`)
      .expect(200);
    expect(res.body.data.url).toBe("https://signed.example/preview.pdf");
  });

  it("returns 404 when the resume has no stored original", async () => {
    resumeFindFirst.mockResolvedValue({
      id: "r1", userId: "test-student-id", isActive: true, originalPdfKey: null,
    });
    await request(app)
      .get("/api/resume/r1/original")
      .set("Authorization", `Bearer ${student}`)
      .expect(404);
  });

  it("returns 404 for a resume owned by someone else", async () => {
    resumeFindFirst.mockResolvedValue({
      id: "r1", userId: "OTHER-user", isActive: true,
      originalPdfKey: "resumes/OTHER-user/r1/preview.pdf",
    });
    await request(app)
      .get("/api/resume/r1/original")
      .set("Authorization", `Bearer ${student}`)
      .expect(404);
  });
});
```

(`studentToken("s1")` issues `sub: "test-student-id"` per `setup.ts`, so the owner test uses `userId: "test-student-id"` and the non-owner uses any other id.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && npx vitest run src/__tests__/resume-original.test.ts -t "GET /api/resume/:id/original"`
Expected: FAIL — route returns 404/HTML for all (route not defined), so the 200 case fails.

- [ ] **Step 3: Add the route**

In `api/src/routes/resume.ts`, immediately AFTER the `router.get("/:id", ...)` handler block, add:

```typescript
// GET /api/resume/:id/original — short-TTL signed URL to the faithful-preview PDF
router.get("/:id/original", async (req: Request, res: Response) => {
  try {
    const resume = await prisma.resume.findFirst({
      where: { id: qs(req.params.id), isActive: true },
    });
    if (!resume || !resume.originalPdfKey) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }
    const canView = await canAccessUser(
      { role: req.userRole || "", userId: req.userId!, schoolId: req.schoolId },
      resume.userId,
    );
    if (!canView) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }
    const url = await getFileUrl(resume.originalPdfKey, 300);
    res.json({ success: true, data: { url } });
  } catch (err) {
    logger.error(err, "Request failed");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd api && npx vitest run src/__tests__/resume-original.test.ts`
Expected: PASS (all 5 tests in the file).

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/resume.ts api/src/__tests__/resume-original.test.ts
git commit -m "feat(resume): ownership-checked signed-URL endpoint for the original"
```

---

## Task 6: Frontend types + `getOriginalUrl`

**Files:**
- Modify: `frontend/src/services/resumeSerialization.ts` (`ApiResumePayload`, `fromApiResume`)
- Modify: `frontend/src/services/resumeService.ts` (`Resume` type, `getOriginalUrl`)
- Test: append to `frontend/src/services/__tests__/resumeSerialization.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/services/__tests__/resumeSerialization.test.ts`:

```typescript
describe("fromApiResume carries original-file metadata", () => {
  it("passes through hasOriginal + originalFileType", () => {
    const r = fromApiResume({
      id: "r1",
      personalInfo: { fullName: "Jane" },
      experience: [],
      education: [],
      skills: [],
      hasOriginal: true,
      originalFileType: "pdf",
    } as never);
    expect(r.hasOriginal).toBe(true);
    expect(r.originalFileType).toBe("pdf");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx jest src/services/__tests__/resumeSerialization.test.ts -t "carries original-file metadata"`
Expected: FAIL — `r.hasOriginal` is `undefined` (not mapped) and/or a type error on `Resume`.

- [ ] **Step 3: Implement — extend the types + mapper**

In `frontend/src/services/resumeService.ts`, add to the `Resume` interface (after `updatedAt?`):

```typescript
  hasOriginal?: boolean;
  originalFileType?: string;
```

In `frontend/src/services/resumeSerialization.ts`:
- Add to `RawResumeEntity`: `hasOriginal?: boolean; originalFileType?: string;`
- Add to `ApiResumePayload`: `hasOriginal?: boolean; originalFileType?: string;`
- In `fromApiResume`, before the final `};` of the returned object, add:

```typescript
    hasOriginal: raw.hasOriginal ?? false,
    originalFileType: raw.originalFileType,
```

Then add `getOriginalUrl` to `frontend/src/services/resumeService.ts` (near `getResumeById`):

```typescript
export async function getOriginalUrl(resumeId: string): Promise<string | null> {
  try {
    const res = await apiRequest(`/api/resume/${resumeId}/original`, { method: "GET" });
    return res?.data?.url ?? res?.url ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx jest src/services/__tests__/resumeSerialization.test.ts`
Expected: PASS (5 prior + 1 new).

- [ ] **Step 5: Verify types**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/resumeService.ts frontend/src/services/resumeSerialization.ts frontend/src/services/__tests__/resumeSerialization.test.ts
git commit -m "feat(resume): frontend carries hasOriginal/originalFileType + getOriginalUrl"
```

---

## Task 7: Original/Edited toggle preview component

**Files:**
- Create: `frontend/src/app/dashboard/resume-builder/_components/ResumePreviewWithToggle.tsx`
- Test: `frontend/src/app/dashboard/resume-builder/_components/__tests__/ResumePreviewWithToggle.test.tsx`

A small presentational component: takes whether an original exists, a loader for the signed URL, and the Edited node. It is intentionally dumb (no data fetching of its own beyond the injected loader) so it is easy to test.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/dashboard/resume-builder/_components/__tests__/ResumePreviewWithToggle.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResumePreviewWithToggle } from "../ResumePreviewWithToggle";

describe("ResumePreviewWithToggle", () => {
  it("defaults to the Original tab and embeds the signed PDF URL when hasOriginal", async () => {
    const loadUrl = jest.fn().mockResolvedValue("https://signed.example/x.pdf");
    render(
      <ResumePreviewWithToggle
        hasOriginal
        loadOriginalUrl={loadUrl}
        edited={<div>EDITED CONTENT</div>}
      />,
    );
    await waitFor(() => expect(loadUrl).toHaveBeenCalled());
    const frame = await screen.findByTitle("Original resume document");
    expect(frame).toHaveAttribute("src", "https://signed.example/x.pdf");
  });

  it("defaults to Edited and hides the Original tab when there is no original", () => {
    render(
      <ResumePreviewWithToggle
        hasOriginal={false}
        loadOriginalUrl={jest.fn()}
        edited={<div>EDITED CONTENT</div>}
      />,
    );
    expect(screen.getByText("EDITED CONTENT")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /original/i })).not.toBeInTheDocument();
  });

  it("switches to Edited when the Edited tab is clicked", async () => {
    render(
      <ResumePreviewWithToggle
        hasOriginal
        loadOriginalUrl={jest.fn().mockResolvedValue("https://signed.example/x.pdf")}
        edited={<div>EDITED CONTENT</div>}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: /edited/i }));
    expect(screen.getByText("EDITED CONTENT")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx jest src/app/dashboard/resume-builder/_components/__tests__/ResumePreviewWithToggle.test.tsx`
Expected: FAIL — cannot resolve `../ResumePreviewWithToggle`.

- [ ] **Step 3: Implement the component**

Create `frontend/src/app/dashboard/resume-builder/_components/ResumePreviewWithToggle.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface Props {
  hasOriginal: boolean;
  loadOriginalUrl: () => Promise<string | null>;
  edited: React.ReactNode;
}

export function ResumePreviewWithToggle({ hasOriginal, loadOriginalUrl, edited }: Props) {
  const [tab, setTab] = useState<"original" | "edited">(hasOriginal ? "original" : "edited");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (hasOriginal && tab === "original" && url === null) {
      loadOriginalUrl().then((u) => {
        if (active) setUrl(u);
      });
    }
    return () => {
      active = false;
    };
  }, [hasOriginal, tab, url, loadOriginalUrl]);

  return (
    <div className="flex flex-col gap-3">
      {hasOriginal && (
        <div role="tablist" className="flex gap-2">
          <button
            role="tab"
            aria-selected={tab === "original"}
            onClick={() => setTab("original")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "original" ? "bg-[#065292] text-white" : "bg-secondary text-foreground"
            }`}
          >
            Original
          </button>
          <button
            role="tab"
            aria-selected={tab === "edited"}
            onClick={() => setTab("edited")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "edited" ? "bg-[#065292] text-white" : "bg-secondary text-foreground"
            }`}
          >
            Edited
          </button>
        </div>
      )}

      {hasOriginal && tab === "original" ? (
        url ? (
          <iframe
            title="Original resume document"
            src={url}
            className="h-[800px] w-full rounded-lg border border-border"
          />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Loading original…</div>
        )
      ) : (
        <div>{edited}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx jest src/app/dashboard/resume-builder/_components/__tests__/ResumePreviewWithToggle.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into the builder preview panel**

`ResumePreviewPanel` currently takes `{ fullName, template, careerField, onPopulateSampleData }` and renders `<LivePreviewPDF />` (the Edited view). Thread two new props through and wrap the Edited view in the toggle.

In `ResumePreviewPanel.tsx`:
- Add to `ResumePreviewPanelProps`: `resumeId: string; hasOriginal: boolean;`
- Add the import: `import { ResumePreviewWithToggle } from "./ResumePreviewWithToggle";` and `import { getOriginalUrl } from "@/services/resumeService";`
- Replace the `<div className="flex-1 overflow-y-auto"><LivePreviewPDF /></div>` block with:

```tsx
      <div className="flex-1 overflow-y-auto p-3">
        <ResumePreviewWithToggle
          hasOriginal={hasOriginal}
          loadOriginalUrl={() => getOriginalUrl(resumeId)}
          edited={<LivePreviewPDF />}
        />
      </div>
```

In `frontend/src/app/dashboard/resume-builder/[id]/page.tsx`, where `<ResumePreviewPanel ... />` is rendered (around line 619), pass the two new props from already-available values:

```tsx
        resumeId={currentResumeId ?? ""}
        hasOriginal={Boolean(apiData?.hasOriginal)}
```

(`currentResumeId` is in scope from the store; `apiData` is the loaded resume from `getResumeById`, which now carries `hasOriginal` after Task 6. If `apiData` is not retained in a variable at render time, store `hasOriginal` in local state when the resume loads and read it here.)

Run after wiring: `cd frontend && npx tsc --noEmit && npx jest`
Expected: tsc clean; full suite green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/dashboard/resume-builder/_components/ResumePreviewWithToggle.tsx frontend/src/app/dashboard/resume-builder/_components/__tests__/ResumePreviewWithToggle.test.tsx frontend/src/app/dashboard/resume-builder/_components/ResumePreviewPanel.tsx
git commit -m "feat(resume): Original/Edited preview toggle"
```

---

## Task 8: Land on Original after upload + "Original" badge on the card

**Files:**
- Modify: `frontend/src/app/dashboard/resumes/_components/ResumeCard.tsx`
- Test: `frontend/src/app/dashboard/resumes/_components/__tests__/ResumeCard.original-badge.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/dashboard/resumes/_components/__tests__/ResumeCard.original-badge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { ResumeCard } from "../ResumeCard";
import type { Resume } from "@/services/resumeService";

const base: Resume = {
  _id: "r1", name: "My Resume", template: "classic",
  personal: { fullName: "Jane", email: "", phone: "", location: "" },
  skills: { skills: {} }, experience: [], education: [],
};

// ResumeCard requires: resume, showMenu, onToggleMenu, onEdit, onDuplicate, onDelete.
const noop = () => {};
const renderCard = (resume: Resume) =>
  render(
    <ResumeCard
      resume={resume}
      showMenu={false}
      onToggleMenu={noop}
      onEdit={noop}
      onDuplicate={noop}
      onDelete={noop}
    />,
  );

describe("ResumeCard original badge", () => {
  it("shows an Original badge when hasOriginal is true", () => {
    renderCard({ ...base, hasOriginal: true });
    expect(screen.getByText(/original/i)).toBeInTheDocument();
  });

  it("hides the badge when hasOriginal is false", () => {
    renderCard({ ...base, hasOriginal: false });
    expect(screen.queryByText(/original/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx jest src/app/dashboard/resumes/_components/__tests__/ResumeCard.original-badge.test.tsx`
Expected: FAIL — no "Original" badge rendered. (If `ResumeCard`'s prop name/shape differs, adjust the test render call to match the real props first; the badge assertion is the behavior under test.)

- [ ] **Step 3: Add the badge**

In `frontend/src/app/dashboard/resumes/_components/ResumeCard.tsx`, where the card header/title renders, add (guarding on the resume prop the component already receives):

```tsx
{resume.hasOriginal && (
  <span className="rounded-full bg-[#FFD600] px-2 py-0.5 text-[10px] font-semibold text-[#111111]">
    Original
  </span>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx jest src/app/dashboard/resumes/_components/__tests__/ResumeCard.original-badge.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Default the upload destination to the Original preview**

Confirm the upload handler in `frontend/src/app/dashboard/resumes/page.tsx` (the `handleUpload` that calls `/api/resume/upload-and-parse`) navigates to `/dashboard/resume-builder/${id}` and that the builder defaults to the Original tab via Task 7 (`hasOriginal` → `tab="original"`). No auto-jump into the templated editor is needed — the toggle default handles it. If the upload handler instead opens a different view, route it to the builder page. Re-run `cd frontend && npx tsc --noEmit && npx jest` after any change.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/dashboard/resumes/_components/ResumeCard.tsx frontend/src/app/dashboard/resumes/_components/__tests__/ResumeCard.original-badge.test.tsx frontend/src/app/dashboard/resumes/page.tsx
git commit -m "feat(resume): Original badge on cards + land on Original after upload"
```

---

## Final verification (after all tasks)

- [ ] `cd api && npx tsc --noEmit && npx vitest run` — API types clean, full suite green.
- [ ] `cd frontend && npx tsc --noEmit && npx jest` — frontend types clean, full suite green.
- [ ] Live (dev): start the dev env, upload a **PDF** → preview shows it as-is on the Original tab; toggle to Edited shows the structured render. Upload a **DOCX** → Original tab shows the converted PDF. Confirm editing fields never changes the Original tab.
- [ ] Deploy notes (separate from this plan): additive migration via the in-VPC Fargate drill; rebuild the (now larger) API image to ECR + App Runner; confirm the App Runner instance role allows `s3:PutObject`/`s3:GetObject` on `nexa-platform-uploads`; Vercel for the frontend.

---

## Notes for the implementer

- The DOCX→PDF converter's true end-to-end behavior depends on LibreOffice, which is present only in the built image (Task 3), not in vitest. The converter unit test (Task 2) covers the temp-file orchestration via an injected runner; the upload-route test (Task 4) mocks the converter boundary. A full DOCX→PDF integration check happens in the live verification step.
- Keep the original immutable: nothing in the edit/save path (`saveResumeToAPI`, `toApiResume`, `updateResume`) writes `originalFileKey`/`originalPdfKey`. Edits only touch the structured columns.
- `api/src/__tests__/setup.ts`: `studentToken(schoolId)` issues `sub: "test-student-id"`, `role: "student"`; `makeToken({...})` lets you set `sub`/`role`/`schoolId`/`permissions`. Task 5's owner tests use `userId: "test-student-id"`.
