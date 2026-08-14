# Calendar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-level Google/Outlook calendar connect for all roles, with encrypted tokens, auto-refresh, and one-way push sync of coach bookings + counselor sessions.

**Architecture:** Provider abstraction (`CalendarProvider` interface, raw fetch) behind a user-level integration service storing AES-256-GCM-encrypted tokens in `user_settings.calendarIntegrations`; new `/api/v1/calendar/*` routes replace the coach-only `/api/v1/coach/auth/*`; a sync service hooks booking/session create/cancel/reschedule and pushes events to each connected participant's own calendar (best-effort, never breaks the booking).

**Tech Stack:** Express 5, Prisma, jsonwebtoken (state), node:crypto (vault), vitest (api), jest+RTL (frontend). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-06-calendar-integration-design.md`

**Conventions that apply everywhere:** ESM imports end in `.js`; api responses `{success, data}`; catch → `logger.error(err, "...")` + fixed message; no `any`; service files ≤300 LOC.

---

### Task 1: Schema + env scaffolding

**Files:**
- Modify: `api/prisma/schema.prisma` (Booking ~:607, CounselorSession ~:1164)
- Modify: `api/.env.example`, `api/.env` (dev values)

- [ ] **Step 1:** Add to BOTH `Booking` and `CounselorSession` models, after `meetingLink`:
```prisma
  calendarEventIds   Json          @default("{}")
```
- [ ] **Step 2:** `cd api && npx prisma format && npx prisma generate && npx prisma db push` (additive; no --accept-data-loss needed). Expected: "Your database is now in sync".
- [ ] **Step 3:** Append to `api/.env.example`:
```
# Calendar integration (user-level OAuth). Redirect URIs derive from API_PUBLIC_URL:
#   {API_PUBLIC_URL}/api/v1/calendar/google/callback
#   {API_PUBLIC_URL}/api/v1/calendar/outlook/callback
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
OUTLOOK_CLIENT_ID=""
OUTLOOK_CLIENT_SECRET=""
API_PUBLIC_URL="http://localhost:3002"
CALENDAR_TOKEN_KEY=""   # 64 hex chars: openssl rand -hex 32
```
- [ ] **Step 4:** In `api/.env` set `API_PUBLIC_URL=http://localhost:3002` and `CALENDAR_TOKEN_KEY=$(openssl rand -hex 32)` (leave client ids empty — graceful unconfigured path is part of the feature).
- [ ] **Step 5:** Remove old `GOOGLE_REDIRECT_URI`/`OUTLOOK_REDIRECT_URI` lines from `.env.example` (superseded by API_PUBLIC_URL derivation).
- [ ] **Step 6:** `npx tsc --noEmit` → pass. Commit: `feat(calendar): additive calendarEventIds columns + env scaffolding`.

### Task 2: Token vault (TDD)

**Files:**
- Create: `api/src/services/calendar/tokenVault.ts`
- Test: `api/src/__tests__/calendar-token-vault.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const KEY = "a".repeat(64);

describe("calendar token vault", () => {
  beforeEach(() => { vi.resetModules(); process.env.CALENDAR_TOKEN_KEY = KEY; });

  it("round-trips a token payload", async () => {
    const { sealTokens, openTokens } = await import("../services/calendar/tokenVault.js");
    const payload = { accessToken: "at-123", refreshToken: "rt-456" };
    const sealed = sealTokens(payload);
    expect(sealed).not.toContain("at-123");
    expect(openTokens(sealed)).toEqual(payload);
  });

  it("rejects tampered ciphertext", async () => {
    const { sealTokens, openTokens } = await import("../services/calendar/tokenVault.js");
    const sealed = sealTokens({ accessToken: "x", refreshToken: "y" });
    const tampered = sealed.slice(0, -4) + "AAAA";
    expect(() => openTokens(tampered)).toThrow();
  });

  it("throws a clear error when the key is missing", async () => {
    delete process.env.CALENDAR_TOKEN_KEY;
    const { sealTokens } = await import("../services/calendar/tokenVault.js");
    expect(() => sealTokens({ accessToken: "x", refreshToken: "y" })).toThrow(/CALENDAR_TOKEN_KEY/);
  });
});
```
- [ ] **Step 2:** `npx vitest run src/__tests__/calendar-token-vault.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement**
```ts
import crypto from "crypto";

export interface TokenPayload { accessToken: string; refreshToken: string; }

function key(): Buffer {
  const hex = process.env.CALENDAR_TOKEN_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("CALENDAR_TOKEN_KEY must be 64 hex chars (openssl rand -hex 32)");
  }
  return Buffer.from(hex, "hex");
}

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext) */
export function sealTokens(payload: TokenPayload): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${ct.toString("base64")}`;
}

export function openTokens(sealed: string): TokenPayload {
  const [iv, tag, ct] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as TokenPayload;
}
```
- [ ] **Step 4:** Run test → 3 PASS. **Step 5:** Commit `feat(calendar): AES-256-GCM token vault`.

### Task 3: Provider interface + Google provider (TDD)

**Files:**
- Create: `api/src/services/calendar/providers/types.ts`, `api/src/services/calendar/providers/google.ts`
- Test: `api/src/__tests__/calendar-provider-google.test.ts`

- [ ] **Step 1:** `types.ts`:
```ts
export type ProviderName = "google" | "outlook";

export interface CalendarEventInput {
  title: string; description: string; location: string;
  startIso: string; endIso: string; // UTC ISO strings
}
export interface ExchangedTokens {
  accessToken: string; refreshToken: string; expiresAt: number; email: string;
}
export interface RefreshedTokens { accessToken: string; expiresAt: number; refreshToken?: string; }

export interface CalendarProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<ExchangedTokens>;
  refresh(refreshToken: string): Promise<RefreshedTokens>;
  createEvent(accessToken: string, ev: CalendarEventInput): Promise<string>; // returns provider event id
  updateEvent(accessToken: string, eventId: string, ev: CalendarEventInput): Promise<void>;
  deleteEvent(accessToken: string, eventId: string): Promise<void>; // 404/410 = already gone = ok
  revoke(refreshToken: string): Promise<void>; // best-effort
}
export class ProviderHttpError extends Error {
  constructor(public status: number, public providerName: ProviderName, op: string) {
    super(`${providerName} ${op} failed with ${status}`);
  }
}
export function redirectUri(provider: ProviderName): string {
  const base = (process.env.API_PUBLIC_URL || "").replace(/\/$/, "");
  return `${base}/api/v1/calendar/${provider}/callback`;
}
```
- [ ] **Step 2: Failing tests** (mock `fetch` with `vi.stubGlobal`); assert: auth URL contains client_id/redirect_uri/`scope=openid+email+...calendar.events`/`access_type=offline`/`prompt=consent`/state; `exchangeCode` POSTs grant_type=authorization_code and returns tokens+email (userinfo call); `refresh` POSTs grant_type=refresh_token; `createEvent` POSTs `calendars/primary/events` with `{summary, description, location, start:{dateTime}, end:{dateTime}}` and returns `id`; `updateEvent` PUTs `events/{id}`; `deleteEvent` DELETEs and treats 404/410 as success but throws ProviderHttpError on 500; 401 on createEvent throws ProviderHttpError(401).
- [ ] **Step 3:** Run → FAIL. **Step 4: Implement** `google.ts` (~120 LOC): endpoints `https://accounts.google.com/o/oauth2/v2/auth`, `https://oauth2.googleapis.com/token`, `https://www.googleapis.com/oauth2/v2/userinfo`, `https://www.googleapis.com/calendar/v3/calendars/primary/events`, revoke `https://oauth2.googleapis.com/revoke`. Scopes: `openid email https://www.googleapis.com/auth/calendar.events`. All non-ok responses → `throw new ProviderHttpError(res.status, "google", op)` (body only to logger).
- [ ] **Step 5:** Run → PASS. **Step 6:** Commit `feat(calendar): provider interface + Google provider`.

### Task 4: Outlook provider (TDD)

**Files:**
- Create: `api/src/services/calendar/providers/outlook.ts`
- Test: `api/src/__tests__/calendar-provider-outlook.test.ts`

- [ ] Same shape as Task 3. Endpoints: `https://login.microsoftonline.com/common/oauth2/v2.0/{authorize,token}`, `https://graph.microsoft.com/v1.0/me` (profile email = `mail || userPrincipalName`), events at `https://graph.microsoft.com/v1.0/me/events`. Scopes `openid profile email offline_access Calendars.ReadWrite`. Event payload `{subject, body:{contentType:"Text", content}, location:{displayName}, start:{dateTime,timeZone:"UTC"}, end:{dateTime,timeZone:"UTC"}}`. **Graph update is HTTP PATCH — required by Microsoft; the no-PATCH rule covers OUR api, not outbound provider calls (comment this at the call site).** No revoke endpoint → `revoke()` is a no-op. Commit `feat(calendar): Outlook provider`.

### Task 5: Integration service (TDD)

**Files:**
- Create: `api/src/services/calendar/calendarIntegrationService.ts`
- Test: `api/src/__tests__/calendar-integration-service.test.ts` (mock `../lib/prisma.js` userSettings + providers)

- [ ] **API of the service:**
```ts
getProvider(name: string): CalendarProvider | null           // validates name
getStatus(userId, provider) → { configured, connected, email, connectedAt }
storeConnection(userId, provider, ExchangedTokens) → void    // seals tokens, upserts user_settings JSON
disconnect(userId, provider) → void                          // best-effort revoke + reset entry to {connected:false}
getValidAccessToken(userId, provider) → string | null        // decrypt; refresh if expiresAt < now+60_000; on refresh fail: entry={connected:false,email,lastSyncError:"token_refresh_failed"} → null
listConnected(userId) → ProviderName[]                       // for sync service
```
Storage entry: `{connected, email, connectedAt, expiresAt, encryptedTokens, lastSyncError?}`. Upsert mirrors `user.ts:284` pattern (`prisma.userSettings.upsert({ where:{userId}, update:{calendarIntegrations}, create:{userId, calendarIntegrations} })`).
- [ ] **Tests:** status of never-connected user → `{connected:false}`; storeConnection → status connected w/ email, raw tokens absent from stored JSON string; getValidAccessToken returns token when fresh; calls provider.refresh when stale and persists rotated tokens; refresh throw → null + connected:false + lastSyncError; disconnect resets entry and calls revoke.
- [ ] RED → implement → GREEN → commit `feat(calendar): user-level integration service with auto-refresh`.

### Task 6: Sync service + hooks (TDD)

**Files:**
- Create: `api/src/services/calendar/calendarSyncService.ts`
- Modify: `api/src/services/coachBookingsService.ts` (createBooking, cancelBooking, rescheduleBooking), `api/src/routes/counselor.ts` (:404 create, :330 cancel, :448 update), `api/src/routes/video.ts` (:219/:393 create, :316/:452 update)
- Test: `api/src/__tests__/calendar-sync-service.test.ts`

- [ ] **Service:**
```ts
type SyncKind = "booking" | "counselorSession";
type SyncAction = "upsert" | "cancel";
export async function syncRecord(kind: SyncKind, recordId: string, action: SyncAction): Promise<void>
export function syncRecordSafe(kind, recordId, action): void   // void promise, catches+logs everything
```
Loads the record fresh by id (booking: include coach for `coach.userId`; counselorSession: counselorId/studentId ARE user ids). Skips sync when record missing or (action upsert && status cancelled). Participants: booking → `[studentId, coach.userId]`; session → `[studentId, counselorId]`. Event: title `Coaching session — {topic||"Coaching"}` / `Counseling session — {topic||"Counseling"}` (booking has no topic column — derive title from `notes` first segment or fixed "Coaching session"); description `Meeting link: {meetingLink}` when present; location meetingLink. For each participant × `listConnected(uid)`: token=getValidAccessToken (null → skip); existing id = `calendarEventIds[uid]?.[provider]`; upsert→update or create+save id; cancel→delete+remove id; per-participant try/catch → `logger.warn({kind, recordId, provider}, "calendar sync failed")` (no emails/names). Persist calendarEventIds once at the end via the record's prisma model.
- [ ] **Tests (mock prisma + integration service + providers):** creates events for both connected participants and stores ids per user/provider; update path reuses stored id; cancel deletes and clears ids; one participant failing doesn't block the other; unconnected users are skipped without provider calls; syncRecordSafe never rejects.
- [ ] **Hooks (after DB write, outside transactions):**
  - `coachBookingsService.createBooking` after successful create: `syncRecordSafe("booking", booking.id, "upsert");`
  - `cancelBooking` after update: `syncRecordSafe("booking", bookingId, "cancel");`
  - `rescheduleBooking` after update: `syncRecordSafe("booking", bookingId, "upsert");`
  - `routes/counselor.ts` create (:404 tx) after tx resolves; cancel (:330) → "cancel"; update (:448) → "upsert" only if startTime/endTime in payload.
  - `routes/video.ts` creates (:219, :393) → "upsert"; updates (:316, :452) → "upsert" only when times change; completed-status-only updates DO NOT sync.
- [ ] RED → implement → GREEN → `npm test` (whole suite green) → commit `feat(calendar): push-sync service hooked into bookings + counselor sessions`.

### Task 7: Routes (TDD) + retire coach-only flow

**Files:**
- Create: `api/src/routes/user-calendar.ts`
- Delete: `api/src/routes/calendar.ts`
- Modify: `api/src/index.ts` (~:249 — replace `app.use("/api/v1/coach/auth", calendarRoutes)` with `app.use("/api/v1/calendar", userCalendarRoutes)`)
- Test: `api/src/__tests__/calendar-routes.test.ts` (supertest, mock authenticate to set req.userId, mock integration service/providers)

- [ ] **Routes (all wrap try/catch per convention):**
  - `GET /:provider/url` (authenticate): provider invalid → 400 `{success:false,message:"Unknown provider"}`. Not configured → `{success:true,data:{configured:false}}`. Else state = `jwt.sign({ userId: req.userId, provider, returnTo }, JWT_SECRET, { expiresIn: "10m" })`, `returnTo` = sanitized `req.query.redirectUrl` (string, startsWith "/", not "//", ≤200 chars, else "/dashboard"). → `{success:true,data:{configured:true,url}}`.
  - `GET /:provider/callback` (NO authenticate): `error` query → redirect `${FRONTEND_BASE_URL}/dashboard?calendar=error`. Verify state (`jwt.verify`; payload.provider must equal `:provider`) else redirect `?calendar=error`. Exchange code → storeConnection → redirect `${FRONTEND_BASE_URL}${returnTo}${returnTo.includes("?") ? "&" : "?"}calendar=connected`; failures redirect `?calendar=error` (never leak details).
  - `GET /:provider/status` (authenticate) → `{success:true,data:getStatus(...)}`.
  - `DELETE /:provider/disconnect` (authenticate) → disconnect → `{success:true,message:"Calendar disconnected"}`.
- [ ] **Tests:** url requires auth (401 unauthenticated); unknown provider 400; unconfigured → configured:false; configured → url contains provider authorize host + state; callback with bad/expired/mismatched-provider state redirects `calendar=error` and stores nothing; happy callback stores and redirects `calendar=connected` preserving returnTo query; status/disconnect call the service with req.userId.
- [ ] Delete `api/src/routes/calendar.ts`; update `index.ts` import/mount. `npx tsc --noEmit` + full `npm test` → green. Commit `feat(calendar): /api/v1/calendar routes for all roles; retire coach-only OAuth`.

### Task 8: Frontend — single service + panel states (TDD)

**Files:**
- Modify: `frontend/src/services/calendarService.ts` (replace OAuth section, lines ~105-160)
- Modify: `frontend/src/services/coachService.ts` (DELETE duplicate getCalendarAuthUrl/checkCalendarAuthStatus/disconnectCalendar/checkGoogleAuthStatus block, lines ~52-108+)
- Modify: `frontend/src/components/shared/CalendarIntegrationPanel.tsx`
- Modify: `frontend/src/components/onboarding/CalendarSyncStep.tsx` (imports → calendarService)
- Test: `frontend/src/services/__tests__/calendarService.test.ts`, `frontend/src/components/shared/__tests__/CalendarIntegrationPanel.test.tsx`

- [ ] **New service contract:**
```ts
export type CalendarProviderName = "google" | "outlook";
export interface CalendarStatus { configured: boolean; connected: boolean; email: string | null; connectedAt: string | null; }
export async function getCalendarAuthUrl(provider): Promise<{ configured: boolean; url?: string }>   // GET /api/v1/calendar/{p}/url?redirectUrl={encodeURIComponent(location.pathname+location.search)}
export async function getCalendarStatus(provider): Promise<CalendarStatus>                            // res?.data ?? fallback {configured:false,connected:false,email:null,connectedAt:null}
export async function disconnectCalendar(provider): Promise<void>                                      // DELETE
```
No `email` params anywhere (identity = JWT). Service tests mock `apiRequest`, assert paths + envelope unwrap (`res?.data ?? res`).
- [ ] **Panel states** (fetch both statuses with `Promise.all` on mount):
  1. neither provider `configured` → muted note "Calendar sync isn't enabled on this server yet." (no buttons)
  2. a provider `connected` → existing connected card (email + Disconnect)
  3. `!connected && email != null` → **Reconnect** card (amber copy "Connection expired — reconnect to keep syncing") with Reconnect button (same flow as connect)
  4. else → existing two Connect cards.
  On mount, if `?calendar=connected` → `toast.success("Calendar connected")`, refetch, strip param (`router.replace(pathname)`); `?calendar=error` → `toast.error("Calendar connection failed")` + strip.
- [ ] **Panel tests** (mock service): each of the 4 states renders; connected fetch failure → falls back to buttons (no crash).
- [ ] RED → implement → GREEN. `npx tsc --noEmit` + `npx jest` from frontend/ → green. Commit `feat(calendar): single frontend service + 4-state panel for all roles`.

### Task 9: Setup doc + checklist

**Files:**
- Create: `docs/integrations/calendar-oauth-setup.md`
- Modify: `docs/qa/student-portal-checklist.md` (calendar 404 minor → fixed by this branch)

- [ ] Setup doc contents: exact Google Cloud Console steps (project → OAuth consent screen External → scopes `openid email calendar.events` → Web client → redirect URIs `http://localhost:3002/api/v1/calendar/google/callback` + `https://5t8ch34ijm.us-east-1.awsapprunner.com/api/v1/calendar/google/callback`), exact Azure steps (App registration → Web platform same URIs with /outlook/ → API permissions delegated `Calendars.ReadWrite, offline_access, openid, email, profile` → client secret), the 5 env values to paste, prod note (App Runner env update at deploy), troubleshooting (redirect_uri_mismatch, consent-screen test users).
- [ ] Commit `docs(calendar): provider OAuth app setup guide`.

### Task 10: Gates + live verification + PR

- [ ] `cd api && npx tsc --noEmit && npm test` → all green.
- [ ] `cd frontend && npx tsc --noEmit && npx jest` → all green.
- [ ] Live (no creds yet, dev servers up): as test.student, counselor, coach — profile/settings calendar panel shows "not enabled on this server" note, **zero 404s in network tab** (batch-13 finding closed). `curl /api/v1/calendar/google/status` with student token → `{configured:false,...}` 200. `curl /api/v1/calendar/badprovider/url` → 400.
- [ ] security-reviewer agent on the branch diff (focus: token storage, state JWT, callback redirect, log hygiene) → must PASS.
- [ ] Push, `gh pr create` → develop. PR body: spec link, what works now vs. what unlocks when creds land, the user's setup-doc TODO.
- [ ] After user pastes creds (follow-up session): full Google+Outlook E2E (connect → book → event in real calendar → reschedule → cancel → gone), then flip panel copy if needed.

## Self-review
- Spec coverage: data model (T1), vault (T2), providers (T3/4), integration service (T5), sync+hooks (T6), routes+retire (T7), frontend (T8), setup doc (T9), gates/live/security (T10). Free/busy, Apple, column drop = out of scope per spec. ✓
- No placeholders: every task names exact files; code given for contracts; test lists are concrete behaviors. ✓
- Type consistency: `sealTokens/openTokens`, `CalendarProvider`, `ExchangedTokens`, `getValidAccessToken`, `syncRecordSafe`, `CalendarStatus` used consistently across tasks. ✓
