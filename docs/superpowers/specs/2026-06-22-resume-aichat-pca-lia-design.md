# Resume AI-Chat Editor + PCA/LIA Result Polish — Design (2026-06-22)

Three demo-critical improvements. Each is an independent commit on one branch.

## A. Resume "Edited" → AI-chat-only editor
**Goal:** Replace the structured editor (and the fragile in-place PDF editor) with a single AI-chat surface that edits the resume; the left live-preview shows results.

- **Frontend** (`app/dashboard/resume-builder/[id]/page.tsx` + new `AIChatEditor.tsx`):
  - Right panel = AI chat: thread + `AIChatInput` (exists) + suggestion chips. Default + only editing tab.
  - Remove the "Editor" (structured section cards) tab. Keep "Style"/template control.
  - For uploaded resumes: keep read-only "Original" toggle (iframe). Remove the in-place `OriginalPdfEditor` ("Edited" overlay) — editing is via chat; preview renders the result.
  - On open: one-line AI analysis greeting + suggestion chips.
- **Backend** — new `POST /api/resume/:id/ai-edit` `{ instruction }`:
  - Load resume → prompt Bedrock `aiJson` with the CURRENT resume JSON + instruction → return the FULL edited resume in the SAME schema the parser uses (personalInfo/experience/education/skills/summary/projects/...).
  - Validate; persist; return updated resume + a short `changeSummary`. On parse/validate failure → 200 `{applied:false, message}` so a resume can never be corrupted.
  - Reuse `aiJson` + the parser's JSON schema. Auth: owner-only (same as other resume routes), `aiLimiter`.

## B. PCA Results popup → wider
`app/dashboard/assessments/_components/PCAResultsPanel.tsx`: `DialogContent` `max-w-4xl` → `max-w-6xl`.

## C. LIA results page → PCA-popup visual style
`app/dashboard/assessments/lia/results/page.tsx`: adopt the PCA card language — a "Personal Information" card + colored score/domain bars for the 5 MIL cognitive domains (mirroring the DISC dimension bars in `PCAResultsPanel`). Keep radar as secondary.

## Sequencing / safety
B → C → A. Gates (api+frontend tsc, build) before deploy. Frontend → Vercel (main). A's backend → ECR image rebuild + App Runner redeploy. AI-edit is schema-constrained + validated → cannot corrupt resumes.
