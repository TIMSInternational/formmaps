-- =====================================================================================
-- 360 INVITATION RECOVERY — READ-ONLY DIAGNOSTICS
--
-- CRITICAL FINDING THIS FILE IS BUILT AROUND:
--   A setup-360 row that was committed but whose SES send FAILED is byte-for-byte
--   IDENTICAL to one whose send SUCCEEDED. Proof:
--     - services/api/src/FormMaps.Infrastructure/SchoolAdmin/SchoolAdminEmailWriter.cs:291
--       the INSERT column list is
--         (id, evaluatorName, evaluatorEmail, relation, groupType, evaluatedUserId,
--          invitationToken, tokenExpiryDate, createdBy, updatedAt)
--       — it does NOT include "isEmailSent" or "emailSentDate".
--     - SchoolAdminEmailWriter.cs:216 commits, THEN :219-228 sends. The send result is
--       only accumulated into a local `emailsSent` int and returned in the HTTP body.
--       There is no UPDATE back to the row.
--     - `grep -rn "isEmailSent|emailSentDate" services/api/src` returns ZERO hits.
--       No .NET code anywhere reads or writes those columns.
--   => Every .NET setup-360 row carries isEmailSent = false / emailSentDate = NULL
--      UNCONDITIONALLY. The email outcome was never persisted anywhere.
--   The legacy Node original has the identical hole
--   (legacy repo (tafurfede/formmaps-platform) api/src/services/schoolAssessmentsService.ts:552-560:
--    createMany, then Promise.allSettled, then no write-back).
--
--   THEREFORE: there is no precise cohort to recover. These queries deliberately do NOT
--   try to reconstruct one. They bound the population, quantify the spam risk of each
--   possible window, and hand the operator the choice.
--
-- HOW TO RUN
--   Every statement below is STANDALONE. There is NO BEGIN/COMMIT/ROLLBACK anywhere,
--   by design: if Q0 reveals a column that does not exist in prod, only the queries that
--   use it fail — the rest still run and still produce numbers. (The previous attempt
--   wrapped everything in one transaction, which made its own safety gate inert.)
--   RUN Q0 AND Q1 FIRST and read them before trusting anything below.
--
--   Substitute where marked  /* PARAM */ .
--   Everything here is SELECT-only. Nothing mutates.
-- =====================================================================================


-- =====================================================================================
-- Q0 — SCHEMA PROBE. Run this first. Do not skip it.
-- Confirms which columns this analysis depends on actually exist in prod.
-- Source of the expectation: legacy repo (tafurfede/formmaps-platform) api/prisma/schema.prisma:972-1007.
-- NOTE: the .NET integration fixture
--   services/api/tests/FormMaps.IntegrationTests/SchoolAdmin/Data/schooladmin-schema.sql:19-38
-- is MISSING isEmailSent, emailSentDate, tokenUsedDate, updatedBy, violations,
-- violation_count and flag_for_review. The tests therefore cannot observe email state
-- at all. Do not infer prod's shape from that fixture — infer it from this query.
-- =====================================================================================
SELECT
    expected.column_name,
    (c.column_name IS NOT NULL) AS exists_in_prod,
    c.data_type,
    c.is_nullable,
    c.column_default
FROM (VALUES
    ('id'), ('evaluatedUserId'), ('evaluatorEmail'), ('evaluatorName'), ('relation'),
    ('groupType'), ('invitationToken'), ('tokenExpiryDate'),
    ('isTokenUsed'), ('tokenUsedDate'),
    ('isEvaluationCompleted'), ('evaluationCompletedDate'),
    ('isEmailSent'), ('emailSentDate'),
    ('isActive'), ('createdBy'), ('createdDate'), ('updatedBy'), ('updatedAt')
) AS expected(column_name)
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public'
      AND c.table_name   = 'evaluation_groups'
      AND c.column_name  = expected.column_name
ORDER BY expected.column_name;


-- =====================================================================================
-- Q1 — CONSTRAINT PROBE.
-- schema.prisma:1002 declares @@unique([evaluatedUserId, evaluatorEmail, groupType]).
-- The SchoolAdmin test fixture does NOT create it (only a PK on id and an index on
-- evaluatedUserId, schooladmin-schema.sql:37 and :148), so no test exercises it.
-- This matters twice over — see Q8 and Q9. Confirm whether prod really has it.
-- =====================================================================================
SELECT
    i.relname        AS index_name,
    idx.indisunique  AS is_unique,
    pg_get_indexdef(idx.indexrelid) AS definition
FROM pg_index idx
JOIN pg_class t ON t.oid = idx.indrelid
JOIN pg_class i ON i.oid = idx.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'evaluation_groups'
ORDER BY idx.indisunique DESC, i.relname;


-- =====================================================================================
-- Q2 — CLOCK / TIMEZONE PROBE. Run before trusting ANY createdDate window below.
--
-- Why this is not paranoia:
--   - "updatedAt" is written by the app as UTC with DateTimeKind.Unspecified
--     (SchoolAdminEmailWriter.cs:331-332, captured at :160).
--   - "createdDate" is NOT written by the app at all (it is absent from the INSERT
--     column list at :291); it falls to the column DEFAULT CURRENT_TIMESTAMP, evaluated
--     by Postgres against the SESSION TimeZone, into a `timestamp WITHOUT time zone`.
--   - NpgsqlFormMapsDatabaseSessionFactory.cs issues no `SET TimeZone`. I could not
--     verify what the role/database default is from source.
--   If the DB session TimeZone is not UTC, createdDate and updatedAt are offset by whole
--   HOURS and every createdDate window below is wrong by that offset. This query measures
--   the offset empirically instead of assuming it.
--
--   The same offset contaminates every WHERE clause in this file: "createdDate",
--   "tokenExpiryDate" and "emailSentDate" are `timestamp WITHOUT time zone`, while now()
--   is timestamptz, so Postgres promotes the column using the session TimeZone on every
--   comparison. Q2's answer therefore calibrates Q3, Q5, Q6, Q7 and Q10 simultaneously.
--
-- Expected if both are UTC: a small NEGATIVE median (createdDate = transaction start,
-- which precedes the `now` captured at line 160), on the order of milliseconds.
-- Anything near +/- 1h..12h means a timezone mismatch. Treat a large |median| as a
-- STOP: recompute the windows in Q3/Q5/Q6 with the measured offset applied.
-- =====================================================================================
SELECT
    count(*)                                                        AS rows_sampled,
    min(g."updatedAt"  - g."createdDate")                           AS min_updated_minus_created,
    percentile_disc(0.5) WITHIN GROUP (
        ORDER BY g."updatedAt" - g."createdDate")                   AS median_updated_minus_created,
    max(g."updatedAt"  - g."createdDate")                           AS max_updated_minus_created,
    min(g."createdDate")                                            AS earliest_created,
    max(g."createdDate")                                            AS latest_created,
    now()                                                           AS db_now_tz,
    current_setting('TimeZone')                                     AS db_session_timezone
FROM "evaluation_groups" g
WHERE g."createdDate" >= now() - interval '90 days';


-- =====================================================================================
-- Q3 — POPULATION INVENTORY BY DAY. No fabricated "batches".
--
-- This groups strictly by calendar day of createdDate, which is a real, immutable
-- property of the row. It does NOT claim any row grouping corresponds to one
-- setup-360 call. (The previous attempt grouped by (createdBy, updatedAt) and called the
-- result "batches" — that is invalid because "updatedAt" is rewritten by at least three
-- unrelated code paths: EvaluationExternalService.cs:349, VocationalTakeService.cs:195
-- and VocationalTakeService.cs:376. VocationalTakeService.cs:195 in particular rewrites
-- updatedAt during a mid-assessment violations merge, WITHOUT setting
-- isEvaluationCompleted — so you cannot even compensate for it.)
--
-- no_delivery_evidence is the honest headline number: rows for which NO code path has
-- ever recorded a successful send. It is a SUPERSET of the SES-failure victims — it also
-- contains every setup-360 row ever created, including ones whose email arrived fine.
-- =====================================================================================
SELECT
    g."createdDate"::date                                                   AS created_day,
    count(*)                                                                AS rows_created,
    count(*) FILTER (WHERE g."isEmailSent" = false)                         AS no_delivery_evidence,
    count(*) FILTER (WHERE g."isEmailSent" = true)                          AS delivery_recorded,
    count(*) FILTER (WHERE g."isEvaluationCompleted" = true)                AS completed,
    count(*) FILTER (WHERE g."isTokenUsed" = true)                          AS token_used,
    count(*) FILTER (WHERE g."tokenExpiryDate" < now())                     AS token_already_expired,
    count(*) FILTER (WHERE g."isActive" = false)                            AS soft_deleted,
    count(DISTINCT g."evaluatedUserId")                                     AS distinct_students,
    count(DISTINCT g."createdBy")                                           AS distinct_creators,
    count(DISTINCT g."tokenExpiryDate")                                     AS distinct_expiry_values
FROM "evaluation_groups" g
WHERE g."createdDate" >= now() - interval '60 days'   /* PARAM: widen/narrow after reading Q2 */
GROUP BY 1
ORDER BY 1 DESC;


-- =====================================================================================
-- Q4 — CANDIDATE RUN GROUPING, WITH ITS CAVEAT STATED.
--
-- Within ONE setup-360 call every inserted row shares the identical tokenExpiryDate:
-- it is a single constant `expiry` computed once (SchoolAdminEmailWriter.cs:160-161) and
-- bound as ONE parameter @exp for every row of the multi-row INSERT (:273, :284).
-- The legacy path does the same (schoolAssessmentsService.ts:501 -> :516/:529/:544).
-- So a distinct tokenExpiryDate value is a plausible run identifier at ms resolution.
--
-- CAVEAT — READ BEFORE USING: tokenExpiryDate is NOT globally immutable. The legacy
-- resend/extend paths overwrite it (evaluationService.ts:354, :380, :440, :469, :505).
-- Those paths are separate from setup-360, so a setup-360 row that was never resent
-- keeps its original value — but any row that WAS resent has silently left its run.
-- This is therefore a LOWER BOUND on run size, not a census. Do not gate anything on it.
-- =====================================================================================
SELECT
    g."tokenExpiryDate"                                             AS run_expiry_constant,
    g."tokenExpiryDate" - interval '48 hours'                       AS implied_run_start,
    g."createdBy",
    count(*)                                                        AS rows_in_group,
    count(DISTINCT g."evaluatedUserId")                             AS students,
    count(*) FILTER (WHERE g."relation" = 'Self')                   AS self_rows_never_emailed,
    count(*) FILTER (WHERE g."isEmailSent" = false)                 AS no_delivery_evidence,
    count(*) FILTER (WHERE g."isEvaluationCompleted" = true)        AS completed,
    min(g."createdDate")                                            AS first_row_created,
    max(g."createdDate")                                            AS last_row_created
FROM "evaluation_groups" g
WHERE g."createdDate" >= now() - interval '60 days'   /* PARAM */
GROUP BY 1, 2, 3
HAVING count(*) > 1
ORDER BY g."tokenExpiryDate" DESC;


-- =====================================================================================
-- Q5 — RESEND CANDIDATE SET (the driver list).
--
-- Predicate, and why each leg is there:
--   isEmailSent = false          -> no code path ever recorded a delivery for this row.
--                                   This is the ONLY honest "not known delivered" signal
--                                   available. It is deliberately conservative-in-the-
--                                   wrong-direction: it also matches setup-360 rows whose
--                                   email DID arrive. Q6/Q7 bound that spam risk.
--   isActive = true              -> mirrors what every reader treats as live.
--   isEvaluationCompleted = false
--   isTokenUsed = false          -> both are proof a human received and acted on the mail
--                                   (set together at EvaluationExternalService.cs:348-349,
--                                   VocationalTakeService.cs:375-376,
--                                   evaluationService.ts:277-278). Excluding them is the
--                                   single strongest anti-spam guard in this design.
--                                   HONEST LIMIT: isTokenUsed is set on SUBMIT, not on
--                                   link-click, so an evaluator who opened the link and
--                                   abandoned it is NOT excluded and may be re-mailed.
--   NOT self-as-parent           -> SchoolAdminEmailWriter.cs:169-176 inserts a
--                                   relation='Self', groupType='Parent' row whose
--                                   evaluatorEmail is the STUDENT'S OWN email, and
--                                   deliberately does not add it to `invites`. It is
--                                   never emailed BY DESIGN. Re-sending it would mail
--                                   students an invitation to evaluate themselves.
--                                   The exclusion is written as the exact tuple the
--                                   writer produces (not merely relation='Self'), because
--                                   relation for a parent-link row is free text copied
--                                   from student_parent_links.relation (:190) and could
--                                   itself literally be 'Self'.
-- =====================================================================================
SELECT
    g."id"                                              AS evaluation_group_id,
    g."evaluatedUserId"                                 AS student_id,
    u."name"                                            AS student_name,
    u."schoolId"                                        AS school_id,
    g."evaluatorEmail",
    g."evaluatorName",
    g."relation",
    g."groupType",
    g."createdDate",
    g."createdBy",
    g."tokenExpiryDate",
    (g."tokenExpiryDate" < now())                       AS token_already_dead,
    age(now(), g."createdDate")                         AS row_age
FROM "evaluation_groups" g
JOIN "users" u ON u."id" = g."evaluatedUserId"
WHERE g."isEmailSent"           = false
  AND g."isActive"              = true
  AND g."isEvaluationCompleted" = false
  AND g."isTokenUsed"           = false
  AND NOT (
        g."relation"       = 'Self'
    AND g."groupType"      = 'Parent'
    AND g."evaluatorEmail" = u."email"
  )
  AND g."createdDate" >= now() - interval '14 days'   /* PARAM: set from Q6, not from a guess */
  -- AND u."schoolId" = '<SCHOOL_ID>'                  /* PARAM: strongly recommended — pilot one school first */
ORDER BY u."schoolId", g."createdDate" DESC, g."evaluatorEmail";


-- =====================================================================================
-- Q6 — SPAM-RISK CURVE. Run this BEFORE choosing the window in Q5.
--
-- Shows how the candidate count grows as the window widens. A wide window sweeps in
-- old, legitimately-delivered setup-360 invitations that merely lack the flag, and
-- re-mails those people. This table is what makes that trade-off explicit instead of
-- letting a hand-picked interval hide it.
-- =====================================================================================
SELECT
    w.label,
    count(*)                                                        AS candidate_rows,
    count(DISTINCT lower(g."evaluatorEmail"))                       AS distinct_recipients,  -- lower(): see Q7/Q8
    count(DISTINCT g."evaluatedUserId")                             AS distinct_students,
    count(DISTINCT u."schoolId")                                    AS distinct_schools,
    count(*) FILTER (WHERE g."tokenExpiryDate" < now())             AS tokens_already_dead
FROM (VALUES
    ('1_within_2_days',   interval '2 days'),
    ('2_within_7_days',   interval '7 days'),
    ('3_within_14_days',  interval '14 days'),
    ('4_within_30_days',  interval '30 days'),
    ('5_within_90_days',  interval '90 days')
) AS w(label, span)
JOIN "evaluation_groups" g ON g."createdDate" >= now() - w.span
JOIN "users" u ON u."id" = g."evaluatedUserId"
WHERE g."isEmailSent"           = false
  AND g."isActive"              = true
  AND g."isEvaluationCompleted" = false
  AND g."isTokenUsed"           = false
  AND NOT (g."relation" = 'Self' AND g."groupType" = 'Parent' AND g."evaluatorEmail" = u."email")
GROUP BY w.label
ORDER BY w.label;


-- =====================================================================================
-- Q7 — PER-RECIPIENT BLAST RADIUS. The "do not carpet-bomb one human" check.
--
-- One evaluator (a counselor especially) can hold one row per student. Counselor rows are
-- inserted one-per-student at SchoolAdminEmailWriter.cs:198-203, so a counselor assigned
-- to 200 students has 200 candidate rows and would receive 200 separate emails from a
-- naive driver. Any resend MUST cap per recipient. Read the top of this list first.
--
-- has_recent_delivered_row: this address has at least one row somewhere with
-- isEmailSent = true in the last 30 days, i.e. mail to them demonstrably works and they
-- have heard from us recently. Strong signal to DEPRIORITISE or exclude them.
-- =====================================================================================
-- Grouped on lower(evaluatorEmail), NOT the raw column: Q8's defect means the same human
-- can hold two rows differing only in case, and a driver that groups on the raw value
-- would count them as two people and mail them twice. Verified against seeded data: Q5
-- does return both 'Parent@Example.com' and 'parent@example.com' for one student.
SELECT
    c.recipient,
    c.candidate_rows,
    c.case_variants_held,
    c.students_referenced,
    c.schools,
    c.oldest_candidate,
    c.newest_candidate,
    (d.recipient IS NOT NULL)                               AS has_recent_delivered_row
FROM (
    SELECT
        lower(g."evaluatorEmail")               AS recipient,
        count(*)                                AS candidate_rows,
        count(DISTINCT g."evaluatorEmail")      AS case_variants_held,
        count(DISTINCT g."evaluatedUserId")     AS students_referenced,
        count(DISTINCT u."schoolId")            AS schools,
        min(g."createdDate")                    AS oldest_candidate,
        max(g."createdDate")                    AS newest_candidate
    FROM "evaluation_groups" g
    JOIN "users" u ON u."id" = g."evaluatedUserId"
    WHERE g."isEmailSent"           = false
      AND g."isActive"              = true
      AND g."isEvaluationCompleted" = false
      AND g."isTokenUsed"           = false
      AND NOT (g."relation" = 'Self' AND g."groupType" = 'Parent' AND g."evaluatorEmail" = u."email")
      AND g."createdDate" >= now() - interval '14 days'   /* PARAM: keep identical to Q5 */
    GROUP BY lower(g."evaluatorEmail")
) c
LEFT JOIN (
    SELECT DISTINCT lower(d."evaluatorEmail") AS recipient
    FROM "evaluation_groups" d
    WHERE d."isEmailSent" = true
      AND d."emailSentDate" >= now() - interval '30 days'
) d ON d.recipient = c.recipient
ORDER BY c.candidate_rows DESC, c.recipient
LIMIT 200;


-- =====================================================================================
-- Q8 — CASE-VARIANT DUPLICATE DETECTOR. Models the dedup asymmetry EXACTLY.
--
-- The dedup HashSet is StringComparer.Ordinal (SchoolAdminEmailWriter.cs:101), i.e.
-- case-SENSITIVE, and is seeded from the RAW DB value (:111). The three probes disagree
-- about case:
--   (a) self      :169  -> raw  users.email
--   (b) parentlink:183  -> link.ParentEmail.ToLowerInvariant()  (:181)   <-- ONLY leg lowercased
--   (c) counselor :198  -> raw  users.email
-- So when an ACTIVE group already stores 'Parent@Example.com' and the parent link also
-- holds 'Parent@Example.com', the probe key uses 'parent@example.com', misses, and the
-- writer inserts a SECOND row storing the lowercased address (:190) while emailing the
-- ORIGINAL-case address (:191).
-- Prod's unique index is on the raw text column (no citext), so the two case variants are
-- distinct keys and the constraint does NOT stop this — it produces a genuine duplicate,
-- and that duplicate DOES get an invite email. The same human can be invited twice.
--
-- Rows returned here are parent links that will duplicate on the NEXT setup-360 run, and
-- are also pairs your resend must collapse to one email.
-- =====================================================================================
SELECT
    l."studentId",
    l."parentEmail"                                     AS link_email_raw,
    lower(l."parentEmail")                              AS probe_key_the_writer_uses,
    g."id"                                              AS existing_group_id,
    g."evaluatorEmail"                                  AS existing_stored_email,
    g."createdDate"                                     AS existing_created,
    'case-variant: probe will MISS this row and insert a duplicate' AS consequence
FROM "student_parent_links" l
JOIN "evaluation_groups" g
      ON g."evaluatedUserId" = l."studentId"
     AND g."groupType"       = 'Parent'
     AND g."isActive"        = true
     AND lower(g."evaluatorEmail") = lower(l."parentEmail")
     AND g."evaluatorEmail"       <> lower(l."parentEmail")   -- stored value is NOT already lowercase
WHERE l."isActive" = true
  -- …and no exact-lowercase row exists. If one does, the probe key HITS it and the writer
  -- correctly skips — flagging that case would be a false positive.
  AND NOT EXISTS (
        SELECT 1 FROM "evaluation_groups" exact
        WHERE exact."evaluatedUserId" = l."studentId"
          AND exact."groupType"       = 'Parent'
          AND exact."isActive"        = true
          AND exact."evaluatorEmail"  = lower(l."parentEmail")
  )
ORDER BY l."studentId", l."parentEmail";


-- =====================================================================================
-- Q9 — SOFT-DELETE POISON DETECTOR (an independent latent outage, not the email bug).
--
-- The dedup query filters isActive = true (SchoolAdminEmailWriter.cs:104). Prod's unique
-- constraint (schema.prisma:1002) does NOT filter on isActive. And the INSERT is ONE
-- multi-row statement with no ON CONFLICT (:289-292).
-- => If any (evaluatedUserId, evaluatorEmail, groupType) exists with isActive = false,
--    the dedup will not see it, the INSERT will raise 23505, the whole statement fails,
--    the transaction aborts, and setup-360 returns 500 having inserted NOTHING for the
--    entire school. One soft-deleted evaluator poisons the whole run.
-- The legacy original has the same defect (createMany with no skipDuplicates,
-- schoolAssessmentsService.ts:553), so this is a faithful port of a real bug, not a
-- regression. It is invisible to the test suite because the fixture never creates the
-- unique index (see Q1).
--
-- A non-empty result here means setup-360 is currently broken for those students.
-- =====================================================================================
SELECT
    dead."evaluatedUserId",
    dead."evaluatorEmail",
    dead."groupType",
    dead."id"           AS soft_deleted_group_id,
    dead."createdDate"  AS soft_deleted_created,
    'setup-360 will 23505 and abort for this student''s whole run' AS consequence
FROM "evaluation_groups" dead
WHERE dead."isActive" = false
  AND NOT EXISTS (
        SELECT 1 FROM "evaluation_groups" live
        WHERE live."evaluatedUserId" = dead."evaluatedUserId"
          AND live."evaluatorEmail"  = dead."evaluatorEmail"
          AND live."groupType"       = dead."groupType"
          AND live."isActive"        = true
  )
ORDER BY dead."evaluatedUserId", dead."evaluatorEmail";


-- =====================================================================================
-- Q10 — CONTROL GROUP. Does isEmailSent = true ever occur at all?
--
-- The whole resend predicate rests on isEmailSent = true meaning "some path proved
-- delivery" (written only on real delivery at evaluationService.ts:114, :405, :453, :476).
-- If this query returns 0 rows for a recent period, then NO live path is marking delivery
-- any more — which would mean isEmailSent = false has degenerated into "every row", the
-- predicate in Q5 carries no signal, and the recovery must be scoped by school and
-- operator confirmation instead of by this flag. Check this before acting on Q5.
-- =====================================================================================
SELECT
    date_trunc('week', g."emailSentDate")   AS week,
    count(*)                                AS rows_marked_delivered,
    count(DISTINCT g."evaluatorEmail")      AS distinct_recipients
FROM "evaluation_groups" g
WHERE g."isEmailSent" = true
  AND g."emailSentDate" >= now() - interval '180 days'
GROUP BY 1
ORDER BY 1 DESC;


-- =====================================================================================
-- RESEND DESIGN — why it cannot spam legitimately-invited students
--
-- PREMISE (the critical finding, restated): there is NO precise cohort. A committed row
-- whose SES send failed is indistinguishable from one whose send succeeded, because
-- neither implementation ever writes the outcome back. So the design below does not
-- pretend to target the victims. It targets "no recorded delivery" and then removes,
-- one guard at a time, every population that a resend would harm.
--
-- VEHICLE — do NOT write a new mailer. Use the legacy one, which is already honest:
--   sendSingleInvitationEmail  — evaluationService.ts:460-479, exposed as
--   POST /api/v1/evaluation/resend-email/:evaluationGroupId  (routes/evaluation.ts:181)
--   It (1) mints a fresh invitationToken and a fresh tokenExpiryDate and resets
--       isTokenUsed  (evaluationService.ts:467-470), and
--   (2) writes isEmailSent = true + emailSentDate ONLY when the mailer really delivered
--       (evaluationService.ts:475-477).
--   Property (1) is mandatory, not a nicety: TokenExpiryMs is 48h
--   (SchoolAdminEmailWriter.cs:24) and every row from the incident window is already past
--   expiry — Q5's token_already_dead column shows this. Re-sending the ORIGINAL token
--   mails a dead link and the recipient bounces off an "expired" screen
--   (evaluationService.ts:126, vocationalTakeService.ts:37).
--   Property (2) is what makes the whole operation IDEMPOTENT and self-limiting: the
--   moment a resend succeeds, that row stops matching Q5's isEmailSent = false predicate.
--   Re-running the driver can therefore never mail the same row twice, and the operation
--   permanently closes the observability hole for every row it touches.
--
-- GUARDS, each mapping to a query above:
--   1. Q0/Q1 first. If isEmailSent does not exist in prod, STOP — the entire predicate is
--      unavailable and nothing below is valid.
--   2. Q10 next. If no row anywhere has been marked delivered recently, isEmailSent=false
--      means "every row" and carries no signal. STOP and scope by operator confirmation
--      instead.
--   3. Q2 before any window. A non-UTC DB session TimeZone shifts every window by hours.
--   4. Q6 chooses the window — read the curve, do not pick an interval by feel. The
--      narrowest window that covers the incident is correct; each step wider re-mails
--      people whose invitation arrived fine and merely lacks the flag.
--   5. Exclude isTokenUsed / isEvaluationCompleted (in Q5). These are proof a human
--      received the mail. HONEST LIMIT: both are set only at SUBMIT
--      (EvaluationExternalService.cs:348-349, VocationalTakeService.cs:375-376,
--      evaluationService.ts:277-278), never at link-click, so an evaluator who opened the
--      link and abandoned it is NOT excluded and will be re-mailed. This is the largest
--      residual spam surface and it cannot be closed from the data — accept it or narrow
--      the window further.
--   6. Exclude the self-as-parent row (in Q5). Never emailed by design
--      (SchoolAdminEmailWriter.cs:169-176 omits it from `invites`). Verified: the exact
--      tuple test returns zero candidates.
--   7. Collapse on lower(evaluatorEmail) (Q7). Q8's defect lets one human hold two rows
--      differing only in case; verified against seeded data that Q5 returns both. A driver
--      grouping on the raw column mails that person twice.
--   8. Cap per recipient. Counselor rows are one-per-student
--      (SchoolAdminEmailWriter.cs:198-203), so a counselor with 200 students has 200
--      candidate rows. Read Q7 top-down and cap; consider deferring anyone with
--      has_recent_delivered_row = true.
--   9. Pilot ONE school (uncomment the schoolId filter in Q5), reconcile the delivered
--      count against SES/CloudWatch, and only then widen.
--
-- SEQUENCING NOTE: fix SES first and confirm with a single manual resend-email call.
-- Running the driver while SES is still failing burns the cohort's tokens
-- (evaluationService.ts:467-470 rotates BEFORE sending) without marking anything sent,
-- leaving the population identical but every prior token invalidated.
--
-- SEPARATE FROM THE EMAIL BUG — two defects Q8 and Q9 detect, both verified empirically
-- against a prod-shaped schema:
--   Q8: prod's unique index is on the raw text column, so 'Parent@Example.com' and
--       'parent@example.com' coexist. VERIFIED: both INSERTs succeed. The lowercase-only
--       parent-link probe (SchoolAdminEmailWriter.cs:181-183) therefore creates genuine
--       duplicate rows AND duplicate invitation emails to the same human.
--   Q9: a soft-deleted (isActive=false) group is invisible to the dedup (:104) but still
--       occupies the unique key, and the writer's INSERT is one multi-row statement with
--       no ON CONFLICT (:289-292). VERIFIED: the whole statement raises 23505 and ZERO
--       rows land — including the non-conflicting ones. One soft-deleted evaluator breaks
--       setup-360 for the entire run. Same defect in legacy
--       (schoolAssessmentsService.ts:553, createMany without skipDuplicates). Invisible to
--       CI because the fixture never creates the unique index (schooladmin-schema.sql:37).
-- =====================================================================================
