# Monorepo Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the live frontend (`formmaps-platform/frontend/`) into `TIMSInternational/formmaps` at
`apps/web` with full git history preserved, replacing the dead 2026-07-15 snapshot, then reconfigure
the existing Vercel project to deploy from the new location — with zero data loss and zero
uncontrolled prod risk at any point.

**Architecture:** Filter `formmaps-platform`'s history down to just `frontend/` (renamed to `apps/web/`)
in a disposable clone via `git filter-repo`, merge that filtered history into a branch of the .NET
repo with `--allow-unrelated-histories`, verify build+history+tests before touching `main`, then
separately (and only after that's stable) reconfigure Vercel's existing project to point at the new
repo/path via its native GitHub integration.

**Tech Stack:** git, git-filter-repo (confirmed installed at `/Library/Frameworks/Python.framework/Versions/3.14/bin/git-filter-repo`), Next.js/npm (frontend build+test), Vercel dashboard (project reconfiguration — no CLI subcommand exists for changing a project's connected repo).

## Global Constraints

- Destination: `TIMSInternational/formmaps`, branch `main`. Frontend replaces `apps/web` there.
- Scope: only `frontend/` moves. `formmaps-platform`'s `api/`, `products/`, and everything else stays
  behind in the (later-archived, never deleted) old repo.
- History must be preserved — `git log --follow`/`git blame` on frontend files must work post-move.
- Branch model: single trunk `main` post-move, matching the .NET repo's existing no-feature-branch
  convention.
- Vercel: reconfigure the **existing** project `prj_14wTHhZMHaiMFoKC9gc7hzAX9GQ7`
  (team `team_LoLTtZ2JybHtpf1jStdAiDbl`) — never create a new project. This preserves all current env
  vars.
- **Nothing in Tasks 7-9 (deploy reconfiguration, prod verification, archiving) executes without a
  fresh, explicit go-ahead from Federico at each of those specific steps** — these are exactly the
  prod-risk / irreversible-adjacent actions the git safety protocol requires pausing for, regardless of
  how this plan is executed. Tasks 1-6 (everything up to and including merging to `main`) are low-risk
  and reversible (see spec's Rollback Plan) and can proceed through review normally.
- Repos referenced by absolute path throughout (both are already cloned locally):
  - `.NET` = `/Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps`
  - `[FE]` = `/Users/federicotafur/formmaps-platform`

---

### Task 1: Preserve the two unpushed stashes in `[FE]` as pushed branches

**Files:** none created/modified — this is pure git ref manipulation, no working-tree changes.

**Interfaces:** none (no later task depends on these branches existing under specific names — they're
a pure safety net, referenced nowhere else in this plan).

- [ ] **Step 1: Confirm the stashes are still exactly what the spec describes**

Run: `git -C /Users/federicotafur/formmaps-platform stash list`
Expected output (order may vary, but both entries must be present):
```
stash@{0}: On develop: wip: FM-DOTNET-043 vocational-take/eval-external rewrites (pre-existing, unrelated to Wave2 Batch1)
stash@{1}: WIP on feat/informe-v2-visuals: 6ca1bf7 Merge pull request #251 from tafurfede/feat/career-informe
```
If either is missing or the list is empty, STOP — do not proceed with this task. Report back with the
actual `stash list` output; something has changed since the spec was written and the rest of this plan
needs to be re-verified before continuing.

- [ ] **Step 2: Branch each stash directly (no apply, no conflict risk)**

A stash entry is itself a commit — pointing a branch at it directly requires no merge/apply and cannot
conflict:

```bash
git -C /Users/federicotafur/formmaps-platform branch preserve/fm-dotnet-043-vocational-take-stash stash@{0}
git -C /Users/federicotafur/formmaps-platform branch preserve/informe-v2-visuals-stash stash@{1}
```

- [ ] **Step 3: Verify both branches were created and point at real content**

```bash
git -C /Users/federicotafur/formmaps-platform log -1 --stat preserve/fm-dotnet-043-vocational-take-stash
git -C /Users/federicotafur/formmaps-platform log -1 --stat preserve/informe-v2-visuals-stash
```
Expected: each shows a commit whose diffstat matches the stash contents from the spec (the first
touches `frontend/next.config.ts`; the second touches 9 files under `api/src/services/informe/sections/`).

- [ ] **Step 4: Push both branches**

```bash
git -C /Users/federicotafur/formmaps-platform push origin preserve/fm-dotnet-043-vocational-take-stash
git -C /Users/federicotafur/formmaps-platform push origin preserve/informe-v2-visuals-stash
```

- [ ] **Step 5: Do NOT drop the original stashes**

Leave `stash@{0}`/`stash@{1}` in place as redundant local safety until the whole migration (through
Task 6) is verified stable. No command to run here — this step is a deliberate non-action, noted so a
reviewer doesn't flag "stashes weren't cleaned up" as a gap.

---

### Task 2: Preserve the uncommitted `pcaService.ts` fix, then remove the dead `apps/web` snapshot

**Files:**
- Modify (commit only, no code changes): `.NET`'s `apps/web/src/services/pcaService.ts`
- Delete: `.NET`'s entire `apps/web/` directory

**Interfaces:** none — this task only prepares the destination path for Task 4's merge.

- [ ] **Step 1: Create the consolidation branch off `main`**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps
git checkout main
git pull origin main
git checkout -b consolidate-frontend
```

- [ ] **Step 2: Confirm the uncommitted diff is still present and matches the spec**

Run: `git diff -- apps/web/src/services/pcaService.ts`
Expected: a diff adding `REP_LINK_KEYS`/`stripRepLink` and calling it from `getPCAVsJCAAnalysis`. If
this is empty or different, STOP — the working tree has changed since the audit; report back before
continuing.

- [ ] **Step 3: Commit the preserved fix on its own**

```bash
git add apps/web/src/services/pcaService.ts
git commit -m "$(cat <<'EOF'
fix(pca): preserve uncommitted client-side CoKey/repLink stripping before apps/web removal

Found uncommitted in this dead snapshot (originally from the initial
"Import FormMaps frontend" migration commit, worktree-agent-a917f0c8fb6ea317b).
Defensive client-side strip of the TIMS vendor CoKey secret from repLink-shaped
response fields, written against a proxy layer this port doesn't have a direct
equivalent for. The server-side fix for the same leak (legacy Node, formmaps-platform
commit cd0e7323) is a different layer and doesn't cover this path.

Committing on its own, immediately before apps/web is removed in the next commit,
so this reasoning and code stay recoverable via git log/blame even though the
file itself goes away. Tracked follow-up: verify whether the live frontend or
the .NET backend's PCA endpoints need the equivalent protection.
EOF
)"
```

- [ ] **Step 4: Remove the dead snapshot**

```bash
git rm -r apps/web
git commit -m "chore(migration): remove dead apps/web snapshot, real frontend lands here in the next commit"
```

- [ ] **Step 5: Verify the directory is gone and history is intact**

```bash
ls apps/ 2>&1  # expected: apps/ itself may or may not still exist (empty), web/ must be gone
git log --oneline -3
```
Expected: the two commits from Steps 3-4 are the tip of `consolidate-frontend`, `apps/web` no longer
exists in the working tree.

- [ ] **Step 6: File the tracked follow-up issue mentioned in Step 3's commit message**

```bash
gh issue create -R TIMSInternational/formmaps \
  --title "Verify PCA CoKey/repLink leak protection on the .NET backend + live frontend" \
  --body "$(cat <<'EOF'
An uncommitted client-side fix was found (and preserved via commit, then the file removed) in the
dead \`apps/web\` snapshot during monorepo consolidation — defensively stripped a TIMS-vendor CoKey
secret from \`repLink\`-shaped response fields before it reached client state. The equivalent
server-side fix for the same leak class landed in legacy Node (formmaps-platform commit \`cd0e7323\`,
\`fix(security): scrub TIMS CoKey from get-competences and get-pca-vs-jca responses\`), but that's a
different layer (Node proxy) than what this uncommitted fix was defending.

A grep of the .NET backend's PCA-related source (\`services/api/src/FormMaps.*/Assessments\`,
\`Reports/PcaReportReader.cs\`) found no existing CoKey/RepLink handling.

**Needs a decision:** does the .NET backend's PCA endpoints need an equivalent server-side scrub before
any \`FORMMAPS_ROUTE_PCA_*\` flags touching get-competences/get-pca-vs-jca-equivalent routes are ever
flipped? Check whether those specific routes are even ported to .NET yet.

Found during monorepo consolidation, 2026-07-31.
EOF
)"
```

---

### Task 3: Extract `frontend/`'s history into a disposable, filtered clone

**Files:** none in either real repo — all work happens in a throwaway clone outside both repos.

**Interfaces:**
- Produces: a filtered git repository at `/tmp/formmaps-platform-frontend-filtered` whose entire
  history is rooted at `apps/web/` (renamed from `frontend/`), consumed by Task 4's merge.

- [ ] **Step 1: Confirm `git-filter-repo` is available**

Run: `git filter-repo --version`
Expected: prints a version string (already confirmed installed at
`/Library/Frameworks/Python.framework/Versions/3.14/bin/git-filter-repo` as of this plan's writing). If
this fails, install first: `brew install git-filter-repo`.

- [ ] **Step 2: Make a fresh, disposable clone — NOT the worktree-attached local directory**

`git-filter-repo` refuses to run against a repo with other worktrees attached, and
`/Users/federicotafur/formmaps-platform` has one (`formmaps-verbalpdf`). Clone fresh instead:

```bash
rm -rf /tmp/formmaps-platform-frontend-filtered
git clone https://github.com/tafurfede/formmaps-platform.git /tmp/formmaps-platform-frontend-filtered
cd /tmp/formmaps-platform-frontend-filtered
```

- [ ] **Step 3: Run the path-filter, renaming `frontend/` to `apps/web/`**

```bash
git filter-repo --path frontend/ --path-rename frontend/:apps/web/
```

- [ ] **Step 4: Verify the filter worked as expected**

```bash
git log --oneline | wc -l
git log --oneline -5
git ls-tree -r HEAD --name-only | head -20
```
Expected: a real, multi-hundred-commit history (not 1); the 5 most recent commits should look like
real frontend-touching commits from `formmaps-platform`'s actual history (e.g. Domain 7b's frontend
commit, `4b3e0605`'s content, appearing under its original message even though the SHA will differ
post-filter); every listed path starts with `apps/web/`.

- [ ] **Step 5: Spot-check history depth on a specific long-lived file**

```bash
git log --oneline --follow -- apps/web/src/app/dashboard/messages/page.tsx | wc -l
```
Expected: more than 1 — confirms this isn't a single flattened "import" commit, real history survived
the filter.

---

### Task 4: Merge the filtered history into the .NET repo's `consolidate-frontend` branch

**Files:**
- Create: `.NET`'s entire `apps/web/` directory (populated by the merge, not written by hand)

**Interfaces:**
- Consumes: the filtered clone from Task 3 (`/tmp/formmaps-platform-frontend-filtered`)

- [ ] **Step 1: Add the filtered clone as a temporary remote**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps
git checkout consolidate-frontend
git remote add frontend-import /tmp/formmaps-platform-frontend-filtered
git fetch frontend-import
```

- [ ] **Step 2: Merge with unrelated histories allowed**

```bash
git merge frontend-import/main --allow-unrelated-histories -m "feat(migration): merge frontend/ history into apps/web (monorepo consolidation)"
```
Expected: clean merge, no conflicts (Task 2 already removed the old `apps/web`, so there's nothing at
that path to conflict with).

If this DOES conflict: STOP. Do not resolve conflicts by guessing — report back the conflicting paths.
A conflict here would mean something exists at `apps/web/` that Task 2 didn't remove; that needs
investigation, not a blind resolution.

- [ ] **Step 3: Remove the temporary remote**

```bash
git remote remove frontend-import
```

- [ ] **Step 4: Verify the merge**

```bash
ls apps/web/ | head -20
git log --oneline -5
git log --oneline --follow -- apps/web/src/app/dashboard/messages/page.tsx | wc -l
```
Expected: `apps/web/` is populated with the real frontend's file structure; the follow-history count
matches what Task 3 Step 5 found (history genuinely carried through the merge, not lost again).

---

### Task 5: Verify the frontend builds and tests pass from its new location

**Files:** none — verification only, no code changes expected. If something breaks, fixing it is a
new sub-task decided in the moment (see "if broken" note in Step 3), not blindly scripted here.

**Interfaces:** none.

- [ ] **Step 1: Install dependencies at the new path**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps/apps/web
npm install
```

- [ ] **Step 2: Run the build**

```bash
npx tsc --noEmit
npx next build
```
Expected: both succeed with no path-resolution errors. A monorepo move can break relative imports,
`tsconfig.json` path aliases, or config files that assumed a specific repo-root-relative location —
this step is what would surface that.

- [ ] **Step 3: Run the test suite**

```bash
npx jest --silent
```
Expected: same pass count as it had at `formmaps-platform`'s `frontend/` before the move (694 tests
per the most recent full run, per this session's Domain 7b work — a materially different count here
means something about the move broke test discovery/config, not that tests were "lost" by the git
mechanics themselves).

**If anything in Steps 1-3 fails:** this is expected to be config/path issues (e.g. a `next.config.ts`
reference to a path that assumed `formmaps-platform` root), not a sign the git history transplant
itself is wrong — Task 4's verification already confirmed the files and history are correct. Fix the
specific broken reference, re-run the failing step, and only move to Task 6 once Steps 1-3 are clean.
Do not merge to `main` (Task 6) with a red build/suite.

---

### Task 6: Merge `consolidate-frontend` into `main`

**Files:** none new — this is the branch merge itself.

**Interfaces:** none.

- [ ] **Step 1: Confirm Task 5 passed cleanly** (re-read its output if resuming this task later — do
  not proceed on a stale memory of "it passed")

- [ ] **Step 2: Merge**

```bash
cd /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps
git checkout main
git merge consolidate-frontend --no-ff -m "feat(migration): consolidate frontend into apps/web, full history preserved"
```

- [ ] **Step 3: Verify `main`'s state**

```bash
git log --oneline -8
git status --short
ls apps/web/ | head -5
```
Expected: clean working tree, `apps/web/` populated, the consolidation commits visible in `main`'s log.

- [ ] **Step 4: STOP HERE — do not push yet**

Per this plan's Global Constraints, pushing `main` is the point where this stops being purely local
and reversible. **Report back to Federico that Tasks 1-6 are done and verified locally, and wait for
explicit confirmation before pushing `main` or touching anything in Tasks 7-9.** Do not push
automatically, even if every prior step succeeded cleanly.

---

### Task 7: Push `main`, then reconfigure Vercel — REQUIRES EXPLICIT GO-AHEAD, do not start without it

**Files:** none — this task is entirely operational (git push + Vercel dashboard configuration), no
code changes.

**Interfaces:** none.

- [ ] **Step 1: Confirm explicit go-ahead was given for this specific task**, separate from whatever
  approval Tasks 1-6 received. If in doubt, ask again rather than assume.

- [ ] **Step 2: Push `main`**

```bash
git -C /Users/federicotafur/Desktop/NexaDev/clients/tims-international/github/formmaps push origin main
```

- [ ] **Step 3: Reconfigure the existing Vercel project's connected repository**

This has no CLI subcommand — done via the Vercel dashboard:
1. Go to the `formmaps` project (`prj_14wTHhZMHaiMFoKC9gc7hzAX9GQ7`, team `team_LoLTtZ2JybHtpf1jStdAiDbl`) → **Settings → Git**.
2. Disconnect the currently-connected `tafurfede/formmaps-platform` repository.
3. Connect `TIMSInternational/formmaps` instead.
4. Under **Settings → General → Root Directory**, set it to `apps/web`.
5. Under **Settings → Git → Production Branch**, set it to `main`.
6. Do NOT touch **Settings → Environment Variables** — reconnecting the repo does not clear these;
   confirm they're still all present after reconnecting, but don't re-enter anything.

- [ ] **Step 4: Verify a deploy succeeds from the new configuration BEFORE touching the production domain**

Trigger a deploy (push `main` already should have, given the new GitHub integration + production
branch setting) and check the Vercel dashboard's deployment log for success — build succeeds, no
missing-env-var errors, no path-resolution errors.

**Do not proceed to Task 8 if this deploy fails or is degraded in any way.** Investigate and fix the
specific failure first.

---

### Task 8: Verify production domain + watch the first real cutover deploy — REQUIRES EXPLICIT GO-AHEAD

**Files:** none.

**Interfaces:** none.

- [ ] **Step 1: Confirm explicit go-ahead was given for this specific task.**

- [ ] **Step 2: Confirm `app.formmaps.com`'s domain alias**

In the Vercel dashboard, under the `formmaps` project's **Settings → Domains**, confirm
`app.formmaps.com` is still listed and pointed at this same project (it should be — no new project was
created — but verify explicitly rather than assume).

- [ ] **Step 3: Load `app.formmaps.com` in a browser and confirm the app actually works**

Check: the page loads, login works, at minimum one flag-gated `.NET`-routed feature (if any are
currently flipped ON in this environment) still behaves correctly. This is the first time this
project's frontend has ever deployed via GitHub integration instead of manual CLI — treat it as a
genuinely new mechanism, not just a path change, and watch it closely.

- [ ] **Step 4: Report status back**

Confirm to Federico that the cutover is live and stable, or report the specific problem if it isn't.
Do not proceed to Task 9 until this is confirmed stable — the spec calls for "a few days" of stability
before archiving, not immediate follow-through.

---

### Task 9: Archive `formmaps-platform` — REQUIRES EXPLICIT GO-AHEAD, days after Task 8, not same-session

**Files:** none.

**Interfaces:** none.

- [ ] **Step 1: Confirm explicit go-ahead was given for THIS SPECIFIC task, given fresh** (per the
  spec's rollback plan, this is the point where reverting via "point Vercel back at the old repo"
  stops being a clean option, since the old repo becomes read-only). Do not treat approval of Tasks
  1-8 as implicitly covering this one — ask again.

- [ ] **Step 2: Archive via `gh` or the GitHub UI**

```bash
gh repo archive tafurfede/formmaps-platform --yes
```

- [ ] **Step 3: Verify**

```bash
gh repo view tafurfede/formmaps-platform --json isArchived
```
Expected: `{"isArchived": true}`.

- [ ] **Step 4: Update memory**

Update `project_dtc_pricing_restructure.md` and any other memory file referencing
`formmaps-platform` as an active working repo (there are several — `reference_formmaps_migration_docs.md`
in particular) to reflect that it's now archived/read-only and `TIMSInternational/formmaps` is the
sole active repo for both frontend and backend.

---

## Self-Review Notes

- **Spec coverage:** all 6 numbered decisions, both pre-flight safety findings, the filter-repo
  mechanics, deploy sequencing, and rollback boundary are each covered by a task above. The spec's "What
  does NOT happen" section is honored by scope (Task 3 filters to `frontend/` only; no task touches
  `formmaps-platform/api/`; no task audits branches beyond what Task 1 already handles).
- **Placeholder scan:** no TBD/TODO; every step has literal commands or literal dashboard click-paths.
- **Type/interface consistency:** N/A in the traditional sense (no function signatures span tasks) —
  the cross-task dependency that matters is the filesystem path `/tmp/formmaps-platform-frontend-filtered`
  (Task 3 produces it, Task 4 consumes it) and `apps/web/` as the landing path (Task 2 clears it, Task 4
  populates it) — both consistent throughout.
