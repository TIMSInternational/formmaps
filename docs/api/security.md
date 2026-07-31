# Security Model

## Baseline Requirements

- Validate JWTs or session tokens at the API boundary.
- Resolve tenant/school/user context before application handlers run.
- Enforce authorization on the server, not only in the UI.
- Preserve existing tenant isolation and RLS protections during migration.
- Write audit records for sensitive student, parent, counselor, and admin flows.
- Minimize data shared through TIMS interop contracts.

## Interop Sharing

FormMaps may share student data with TIMS ATS only when:

1. the student or authorized guardian has granted consent,
2. the data packet is limited to the approved contract,
3. the target partner and opportunity are valid,
4. both systems record audit events.

## Database Role

The .NET API connects as a dedicated role, `formmaps_dotnet_svc`, not the
legacy Node app's shared credential (formmaps#10). The role is:

- **Not** superuser, `CREATEDB`, `CREATEROLE`, or `REPLICATION`.
- **Not** `BYPASSRLS`. RLS bypass for privileged/service paths is handled at
  the application layer via the `app.bypass_rls` session GUC
  (`RlsSessionCommandBuilder`, `NpgsqlFormMapsDatabaseSessionFactory`), which
  each table's RLS policy predicate reads — a Postgres-level bypass on the
  role itself would defeat that and is intentionally withheld.
- Scoped to `SELECT`/`INSERT`/`UPDATE`/`DELETE` grants on exactly the tables
  the service's repository/reader/writer code touches — no `CREATE` on the
  schema, no access to tables or schemas the service doesn't use.

The role-creation script, the full per-table grant scope, and instructions
for applying it to an environment live in
`infra/aws/sql/dotnet-service-role.sql`. Applying it to staging/prod and
rotating `DATABASE_URL` to the new credential is a manual ops action, not
something this script does on its own — see that file's header comment.
