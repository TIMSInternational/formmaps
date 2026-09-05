/**
 * Parity check: infra/aws/formmaps-api-prod-service.yml must declare every permission
 * that was granted to formmaps-api-prod-instance BY HAND.
 *
 * Run:  node --test scripts/prod-instance-policies.test.ts
 *
 * WHY THIS EXISTS. Wave 3 tasks 3.1/3.2 put two INLINE policies on the prod instance
 * role with `aws iam put-role-policy` — formmaps-dotnet-s3-uploads and
 * formmaps-prod-ses-send — and recorded them only in
 * docs/superpowers/plans/2026-07-27-wave3-infra-gates.md. The CloudFormation template
 * declared one policy (read-formmaps-prod-secrets), so the live role and the template
 * disagreed: undeclared drift that a `cloudformation deploy` neither reproduces nor
 * removes (inline policies added outside a stack are not stack-managed), and that
 * nothing detected. Recreating the role from this template alone would produce a
 * service that cannot upload to S3 or send mail.
 *
 * NO NETWORK, NO AWS. Both sides are files in this repo: the plan document is the
 * record of what was actually granted, the template is what the stack would create.
 * The comparison is textual on purpose — it is a drift guard, not a policy evaluator.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLAN = readFileSync(
  join(REPO, "docs/superpowers/plans/2026-07-27-wave3-infra-gates.md"),
  "utf8",
);
const TEMPLATE = readFileSync(join(REPO, "infra/aws/formmaps-api-prod-service.yml"), "utf8");

/**
 * The account and region every ARN in the plan document is written against. Asserted
 * against the template below rather than trusted, so a copy of this suite pointed at a
 * different account fails loudly instead of comparing two unrelated worlds.
 */
const ACCOUNT_ID = "747814092517";
const REGION = "us-east-1";

/** The hand-made inline policy names. The template must NOT reuse them (see below). */
const INLINE_POLICY_NAMES = ["formmaps-dotnet-s3-uploads", "formmaps-prod-ses-send"];

interface PolicyDocument {
  Statement: { Sid?: string; Effect: string; Action: string[]; Resource: string | string[] }[];
}

/** Pull a single-quoted `--policy-document '{...}'` JSON blob out of the plan's shell block. */
function planPolicy(policyName: string): PolicyDocument {
  const m = new RegExp(
    `--policy-name ${policyName}[\\s\\S]*?--policy-document '(\\{[\\s\\S]*?\\})'`,
  ).exec(PLAN);
  assert.ok(
    m,
    `no --policy-document found for ${policyName} in the Wave 3 plan. If the plan was ` +
      `restructured, re-point this suite at the new record of what the role was granted — ` +
      `do NOT delete the check, it is the only thing tying the live role to the template.`,
  );
  return JSON.parse(m[1]) as PolicyDocument;
}

/**
 * Resolve the template into plain text: CloudFormation pseudo-parameters and every
 * `${Param}` replaced by that parameter's declared Default. Without this a `!Sub`-built
 * ARN could never be compared with the literal ARN the plan records.
 */
function resolvedTemplate(): string {
  const defaults = new Map<string, string>();
  let current: string | null = null;
  for (const line of TEMPLATE.split("\n")) {
    const param = /^ {2}([A-Za-z0-9]+):$/.exec(line);
    if (param) current = param[1];
    else if (/^ {0,1}\S/.test(line)) current = null;
    const def = /^ {4}Default: (.+)$/.exec(line);
    if (def && current) defaults.set(current, def[1].trim());
  }
  assert.ok(defaults.size > 0, "parsed zero parameter defaults out of the prod template");

  let text = TEMPLATE.replaceAll("${AWS::Partition}", "aws")
    .replaceAll("${AWS::Region}", REGION)
    .replaceAll("${AWS::AccountId}", ACCOUNT_ID);
  for (const [name, value] of defaults) text = text.replaceAll("${" + name + "}", value);
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLS: prove both sides are actually being read before asserting on them
// ─────────────────────────────────────────────────────────────────────────────

test("CONTROL: the plan really records both hand-made policies", () => {
  const s3 = planPolicy("formmaps-dotnet-s3-uploads");
  assert.deepEqual(
    s3.Statement.map((s) => s.Sid),
    ["S3Uploads", "S3List"],
  );
  const ses = planPolicy("formmaps-staging-ses-send");
  assert.equal(ses.Statement.length, 1);
  assert.ok(ses.Statement[0].Action.length > 0);
});

test("CONTROL: the template is written against the account the plan's ARNs name", () => {
  assert.match(TEMPLATE, new RegExp(`arn:aws:apprunner:${REGION}:${ACCOUNT_ID}:`));
});

// ─────────────────────────────────────────────────────────────────────────────
// THE DRIFT GUARD
// ─────────────────────────────────────────────────────────────────────────────

test("prod template declares the S3 uploads permissions granted by hand", () => {
  const text = resolvedTemplate();
  for (const stmt of planPolicy("formmaps-dotnet-s3-uploads").Statement) {
    for (const action of stmt.Action) {
      assert.ok(
        text.includes(action),
        `prod instance role is missing ${action} — the live role has it via the inline ` +
          `policy formmaps-dotnet-s3-uploads, the template does not declare it.`,
      );
    }
    for (const resource of [stmt.Resource].flat()) {
      assert.ok(
        text.includes(resource),
        `prod instance role is missing the resource ${resource} (statement ${stmt.Sid}).`,
      );
    }
  }
});

test("prod template declares the SES send permissions granted by hand", () => {
  const text = resolvedTemplate();
  // The plan patches PROD's policy in place (Task 7 Step 1) and only writes the full
  // document out for STAGING (Step 2), so prod's action list comes from the jq patch
  // and its resource from the staging document — the same verified SES identity.
  const patched = /\.Statement\[0\]\.Action = (\[[^\]]*\])/.exec(PLAN);
  assert.ok(patched, "the plan no longer records the prod SES action patch");
  const actions = JSON.parse(patched[1]) as string[];
  assert.deepEqual(actions, ["ses:SendEmail", "ses:SendRawEmail"]);

  const staging = planPolicy("formmaps-staging-ses-send").Statement[0];
  for (const action of [...actions, ...staging.Action]) {
    assert.ok(
      text.includes(action),
      `prod instance role is missing ${action} — the live role has it via the inline ` +
        `policy formmaps-prod-ses-send, the template does not declare it.`,
    );
  }
  for (const resource of [staging.Resource].flat()) {
    assert.ok(text.includes(resource), `prod instance role is missing the SES identity ${resource}.`);
  }
});

test("stack-managed policy names do not collide with the hand-made inline ones", () => {
  // A colliding PolicyName would make the first deploy silently overwrite the
  // hand-made policy, which removes the ability to compare them and makes the
  // cleanup step below unverifiable. Distinct names mean the first deploy is
  // purely additive and the inline ones can be deleted afterwards, deliberately.
  for (const name of INLINE_POLICY_NAMES) {
    assert.ok(
      !new RegExp(`PolicyName: ${name}\\s*$`, "m").test(TEMPLATE),
      `template declares PolicyName ${name}, which collides with the hand-made inline policy`,
    );
  }
});

test("the template says what to do about the now-duplicated inline policies", () => {
  // The cleanup is an ops action (aws iam delete-role-policy), not something the
  // stack can do — so it has to be written down where the next person deploying looks.
  for (const name of INLINE_POLICY_NAMES) {
    assert.ok(
      TEMPLATE.includes(name),
      `template never mentions ${name}, so nothing tells an operator it is now redundant`,
    );
  }
  assert.match(TEMPLATE, /delete-role-policy/);
});
