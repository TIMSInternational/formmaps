# Questions for TIMS / CDS — iSAMS connector & CSV Grade Import 📋

Purpose: gather missing decisions, API access, data formats and acceptance criteria needed to implement CSV grade import and the iSAMS integration.

---

## 1 — Project / scope & priorities 🔀
- Confirm priority: implement CSV Grade Import MVP + iSAMS connector admin UI — is this correct?
- Who is the technical contact for backend (.NET) work and who will implement server endpoints? (name / email / repo)
- Target delivery date for CSV + iSAMS MVP?

---

## 2 — iSAMS (SIS) integration details 🏫
- Do you have an iSAMS sandbox/test account we can use? Please provide endpoint, client credentials, and contact person.
- iSAMS API type & auth: REST (API key) or OAuth2 or SOAP? Share auth flow details.
- Which iSAMS endpoints are available to us? (roster, enrollment, grades, courses, sections)
- Push vs pull: should our system poll iSAMS, or will iSAMS push changes (webhooks)?
- Sync cadence: manual only, scheduled (daily/hourly), or real‑time?
- Incremental sync: do you expect full exports or delta (lastModified) support?
- Rate limits / throttling constraints for iSAMS API?
- Any IP allowlist or VPN requirements for connecting to iSAMS?

---

## 3 — CSV Grade import — schema & behavior (confirm) 🗂️
- Confirm CSV columns we should support (example recommended):
  `student_id, student_email, course_code, semester, grade, credits, status`
- Authoritative student key: which should we match on? (`student_id` / `email` / SIS external id)
- Course matching: match by `course_code` (external). Should we:
  - auto-map to internal courseId, or  
  - require admin-provided mapping before import?
- Allowed grade values (confirm / extend): A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F, P, NP, I, W
- `status` values meaning: accepted values and mapping to internal enrollment state (e.g., completed/in-progress/withdrawn)
- `semester` canonical format — confirm (e.g., `Fall 2025` / `2025-Fall` / `2025-09`).
- `credits` format: decimal with dot (e.g., `1.0`) — confirm precision.
- Duplicate-row handling / idempotency: should duplicate rows be ignored, deduped, or fail import?
- Partial failure policy: abort entire import on row errors, or import valid rows and report failures?
- Max rows per import and recommended file size limits?
- Expected behavior for missing students or missing courses (skip + report / create placeholder / fail)?
- Required audit & retention: what import metadata must be stored (uploader, timestamp, file, diff, who/what changed)?
- Notifications: who should get import results (School Admin / Counselors)? Email or in-app?

---

## 4 — API contract & backend behavior (confirm) ⚙️
- Backend owner: will backend endpoints be added in the .NET repo or should we add Next.js stubs for dev?
- Desired import API response behavior:
  - immediate validation + job-id and async processing (preferred) — confirm
  - synchronous apply (only for small files)
- Response payload for validation/job result — required fields (rowsProcessed, rowsFailed[], errorMessages[])
- Provide sample API error codes/messages for common failures
- Should we expose webhook or callback when job completes? If yes, provide webhook URL and auth method

---

## 5 — Mapping & reconciliation rules 🔁
- Course code mapping source of truth — who maintains it? (school admin UI vs CSV mapping file)
- If external code not found, preferred behavior: create placeholder, flag error, or drop row?
- Student ID collisions (multiple students with same email) — expected resolution strategy?

---

## 6 — Security, privacy & compliance 🔒
- Data residency requirement (Costa Rica / other) — confirm where grade data must be stored.
- PII policy for sending to external services — any restrictions we must enforce?
- Audit log retention period and export requirements for compliance
- Can we change authentication behavior (move refresh tokens to httpOnly cookie)? Approve or defer?

---

## 7 — UI / UX expectations (preview & admin flows) 🖥️
- CSV preview UX: show line-level validation with ability to correct in UI — required? (yes/no)
- Require import confirmation modal with summary (rows OK / rows with errors) — required? (yes/no)
- Who can perform imports? Roles allowed: `school_admin`, `super_admin`, `counselor`?
- Should import jobs appear in an admin job queue with retry/dismiss actions?

---

## 8 — Error handling, retries & monitoring 🛠️
- Retry policy for transient backend failures (automated retry attempts)?
- Required error reporting format for admins (CSV of failed rows, UI download)?
- Monitoring / alerts: which channel for import failures (email, Slack, PagerDuty)?

---

## 9 — Tests, staging & acceptance ✅
- Provide test/staging credentials and a sample CSV (good + bad rows).
- Acceptance criteria for MVP (confirm): preview + validation UI, job creation + async processing, audit log, error report.
- Test coverage targets for this feature (unit / integration / e2e)?

---

## 10 — Additional / future items (confirm interest) 🔮
- Do you want automatic mapping suggestions (AI-assisted course recognition) for unmatched course names?  
- Proctoring: do you require for any assessments now, or defer to later? (If yes, supply vendor preference and requirements.)

---

## Requested artifacts / deliverables from TIMS / CDS 📎
- iSAMS sandbox credentials and API docs  
- 2–3 sample CSVs (small good, small with errors, large sample)  
- Course-code → internal-courseId mapping table (CSV) or access to mapping UI/data  
- Staging API credentials and a test schoolId

---

Please reply with the requested artifacts and any clarifications so we can start development on the CSV grade import + iSAMS connector MVP.
