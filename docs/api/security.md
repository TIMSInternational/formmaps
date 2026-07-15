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
