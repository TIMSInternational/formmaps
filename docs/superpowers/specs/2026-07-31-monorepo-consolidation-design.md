# Monorepo Consolidation: Fold `formmaps-platform` Frontend Into `TIMSInternational/formmaps`

## Goal

FormMaps currently lives in two separate GitHub repos with no code-level relationship:

- **`TIMSInternational/formmaps`** (`main`) — the .NET 10 backend migration target. Its own
  `apps/web` directory is a **frozen, stale snapshot from 2026-07-15**, never deployed, never
  updated since.
- **`tafurfede/formmaps-platform`** (`develop`) — the real, currently-deployed frontend
  (`app.formmaps.com`, deployed via a manual `vercel --prod` CLI call, not gated on any GitHub
  integration).

Federico wants one repo going forward, with the .NET backend repo as the permanent home. This spec
covers moving the **live** frontend (`formmaps-platform/frontend/`) into `TIMSInternational/formmaps`
at `apps/web` — replacing the dead snapshot — with full git history preserved, and reconfiguring the
existing Vercel project to deploy from the new location.

**Explicitly out of scope:** the legacy Node source (`formmaps-platform/api/`), `products/`, and every
other top-level folder in `formmaps-platform` besides `frontend/`. Those stay behind in the archived
`formmaps-platform` repo — still fully readable, just not part of the new combined repo. Domain 9/11
(the Node retirement work) may revisit `api/` later; that's unaffected by this move.

## Decisions already made (via Q&A, not re-litigated here)

1. **Destination:** `TIMSInternational/formmaps`, `main`. Frontend replaces the dead `apps/web`.
2. **History:** preserved, not squashed — `git log`/`git blame` on any frontend file must keep working
   after the move.
3. **Scope:** only `frontend/` moves. `api/`, `products/`, and everything else in `formmaps-platform`
   stays behind.
4. **Branch model:** single trunk `main` for both halves post-move — this matches the .NET repo's
   existing convention (no feature branches, dark/flag-gated direct commits) and the frontend adopts it
   too. The frontend's `develop` branch habit ends here.
5. **Deploy:** switch from manual `vercel --prod` CLI to Vercel's native GitHub integration, watching
   `main` in the combined repo. Reconfigure the **existing** Vercel project
   (`prj_14wTHhZMHaiMFoKC9gc7hzAX9GQ7`, team `team_LoLTtZ2JybHtpf1jStdAiDbl`, confirmed via
   `formmaps-platform/.vercel/project.json`) rather than creating a new one — this preserves every
   currently-configured env var without re-entering them.
6. **Old repo fate:** archive `formmaps-platform` on GitHub after the cutover is verified stable for a
   few days. Not deleted. Archiving makes it read-only but keeps 100% of its history (all 75 local /
   153 remote branches, every commit) permanently browsable — this is the safety net for everything
   *not* explicitly carried forward below.

## Pre-flight safety findings (from full audit of both repos, 2026-07-31)

Before any destructive or history-rewriting operation, three things needed handling — none of them
are covered by "archive the repo," because they either predate any remote push or live in a directory
about to be deleted:

1. **Two local-only stashes in `formmaps-platform`, never pushed anywhere:**
   - `stash@{0}` — uncommitted `frontend/next.config.ts` rewrites for FM-DOTNET-043
     (`shouldRouteVocationalTakeToDotnet`/`shouldRouteEvalExternalToDotnet` rewrite rules).
   - `stash@{1}` — uncommitted informe-PDF rendering work across 9 files in
     `api/src/services/informe/sections/` (illustration/icon additions, competencias panel
     auto-sizing). This one touches `api/`, which is out of scope for the move itself, but the stash
     still needs to survive independent of what happens to this local clone.

   **Action:** `git stash branch` each into its own branch and push both to `origin` *before* touching
   anything else. This is a pure addition — no existing ref changes, no risk, and it's what makes the
   later "archive is a sufficient safety net" reasoning actually true.

2. **Uncommitted change in the .NET repo's dead `apps/web/src/services/pcaService.ts`:** a real,
   never-finished security hardening fix — defensively strips a TIMS vendor-embedded `CoKey` secret
   from `repLink`-shaped response fields before it reaches client state. Its own comment states the
   reasoning: the equivalent server-side fix (`formmaps-platform` commit `cd0e7323`,
   `fix(security): scrub TIMS CoKey from get-competences and get-pca-vs-jca responses`) closed this at
   the legacy Node layer, but this client-side version was written against a different proxy layer and
   never got finished or committed. A grep of the .NET backend's PCA-related source found no
   equivalent `CoKey`/`RepLink` handling — meaning if PCA report endpoints are ever routed to the .NET
   backend without an equivalent server-side scrub, this client-side gap would matter again.

   **Action:** commit this fix into `apps/web` (with a clear "preserving pre-existing uncommitted WIP
   before removal" message) as the *first* commit of this whole effort, immediately before deleting
   `apps/web` — so it's permanently recoverable via `git log`/`git blame` even though the file itself
   goes away. Follow up with a GitHub issue recommending someone check whether the live frontend or the
   .NET backend's PCA endpoints need the same protection once/if that domain routes through .NET.

3. **Scale of `formmaps-platform`'s branch history (75 local / 153 remote branches) is NOT individually
   audited.** Spot-checked two security-hotfix-named branches (`hotfix/pca-cokey-leak`,
   `fix/meetinglink-security-prod`) — both show "unique" commits relative to `develop` by SHA, but
   their content is already reflected in `develop` under different commit hashes (consistent with a
   cherry-pick/squash-merge PR workflow, not lost work). Auditing all 228 branches individually is out
   of proportion to this task's actual goal. This is safe **specifically because** the repo is archived,
   not deleted — every one of those branches remains fully intact and clonable forever in the archived
   repo. No further action needed here; noting it so this isn't a silent scope-narrowing.

## Mechanics: how the history-preserving move actually happens

**Chosen approach: `git filter-repo` path-filter on a throwaway clone, then merge into the .NET repo.**

Rejected alternative: plain `git subtree add` (pull in the whole `formmaps-platform` history, then
`git rm` everything except `frontend/` in a follow-up commit). Simpler tooling, but the unwanted
history (`api/`, `products/`, etc.) still exists in the combined repo's object database even after
being removed from the tree — it clutters `git log`/`blame` on unrelated paths and bloats repo size
for no benefit, since we've already decided that history isn't coming forward.

**Steps:**

1. Push the two stash-branches (safety finding #1). Confirm they're on `origin` before continuing.
2. In the .NET repo (a fresh clone or the existing checkout — filter-repo mutations happen in a
   *separate* throwaway clone, never touching the live checkout with other worktrees attached):
   commit the preserved `pcaService.ts` fix (safety finding #2), then `git rm -r apps/web` and commit
   the removal separately (two distinct commits: "preserve WIP" then "remove dead snapshot" — keeps
   the history legible and the preserved fix recoverable as its own commit).
3. Make a fresh, disposable clone of `formmaps-platform` (not the worktree-attached local directory —
   a brand new `git clone` elsewhere on disk, since `git filter-repo` refuses to run against a repo
   with other worktrees attached, and `formmaps-platform` has one: `formmaps-verbalpdf`).
4. In that disposable clone, run `git filter-repo --path frontend/ --path-rename frontend/:apps/web/`
   — rewrites history so only `frontend/`'s commits survive, renamed to the `apps/web/` path they'll
   occupy in the combined repo.
5. Back in the .NET repo (the real one, on a new branch off `main` — not `main` directly, so nothing
   touches production until fully verified): add the filtered clone as a temporary remote, fetch it,
   and merge with `--allow-unrelated-histories`. Because step 2 already removed the old `apps/web`,
   the incoming filtered history lands cleanly at `apps/web/` with no path conflicts.
6. Verify on that branch: `git log --follow -- apps/web/src/app/dashboard/messages/page.tsx` (or any
   long-lived frontend file) shows real pre-move history, not just one "import" commit. Run the
   frontend's build (`npm run build` / `next build`) and test suite from its new location to confirm
   nothing broke in the move (path-dependent imports, config file references, etc.).
7. Only after that verification passes: merge the branch into `main`.

## Deploy cutover sequencing (the actual prod-risk part)

1. All of the above happens on a branch first — `main` is untouched until step 7 above passes.
2. Reconfigure the *existing* Vercel project's connected repository (Vercel supports changing a
   project's linked GitHub repo without recreating it) to point at `TIMSInternational/formmaps`, root
   directory `apps/web`, production branch `main`. This preserves every currently-set env var.
3. Trigger a deploy from the new configuration and verify it succeeds and serves correctly — via a
   preview/staging check, *before* touching the `app.formmaps.com` domain alias.
4. Once verified, confirm `app.formmaps.com`'s domain alias is still correctly pointed at the
   (now-reconfigured) same Vercel project — it should be, since we didn't create a new project, but
   this gets an explicit check rather than an assumption.
5. Watch the first real production deploy from the new pipeline closely (this is also the first time
   this project's frontend deploys via GitHub integration instead of manual CLI — a genuinely new
   mechanism, not just a path change).

## Rollback plan

- **Before step 7 (merge to `main`):** trivially abortable — delete the working branch, nothing in
  `main` or production ever changed.
- **After step 7, before Vercel cutover (step 2 of deploy sequencing):** `main` has the new history, but
  Vercel is still deploying from the old `formmaps-platform` repo/pipeline — production is completely
  unaffected. Reverting `main` in the .NET repo (if some other problem is found) costs nothing in prod
  terms.
- **After Vercel cutover:** revert by pointing the Vercel project's connected repo back to
  `formmaps-platform` / `develop` (nothing about `formmaps-platform` has been deleted or made
  unusable at this point — only archived later, after stability is confirmed). This is the reason
  archiving happens last, several days after cutover, not immediately.

## What does NOT happen in this effort

- No changes to `formmaps-platform/api/` (legacy Node) — stays where it is, addressed separately under
  Domain 9/11.
- No audit of `formmaps-platform`'s other 227 branches beyond the spot-checks above.
- No deletion of `formmaps-platform` — archive only, and only after stability is confirmed.
- No changes to the .NET backend's actual application code — this is a repo/deploy-structure change,
  not a feature or bugfix.
