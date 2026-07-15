# Cutover Matrix

This matrix tracks which product areas are still legacy-owned and which are
ready for .NET ownership.

| Domain | Current Owner | Target Owner | First Migration Move | Risk |
|---|---|---|---|---|
| Health/version | .NET scaffold | .NET | Keep in .NET | Low |
| Auth/session | Node | .NET | Add validation parity, cut over late | High |
| Request context/tenant | Node + RLS | .NET + RLS | Build context abstraction first | High |
| Audit/events | Node/app logs | .NET | Add abstraction, then persistent audit | Medium |
| Reports/dashboards | Node | .NET | Read-only endpoint first | Medium |
| Assessments/readiness | Node | .NET | Read APIs before write/scoring | High |
| PCA/TIMS vendor API | Node | .NET | Contract and key handling first | High |
| Schools/rosters | Node | .NET | Read-only school/roster queries first | Medium |
| Counselor workflows | Node | .NET | Assignment-scoped read APIs first | High |
| Student workflows | Node | .NET | Own-record read APIs first | High |
| Parent workflows | Node | .NET | Linked-child read APIs first | High |
| Messaging | Node | .NET | Defer until identity is stable | Medium |
| Video | Node | .NET | Defer until auth/session stable | Medium |
| Resume/docs | Node | .NET | Defer file and PDF flows | Medium |
| Billing/Stripe | Node | .NET | Defer until core stable | High |

## Completion Definition

A row can move to .NET-owned only when:

- endpoint contract is documented,
- role/tenant parity tests exist,
- frontend route is feature-flagged,
- staging smoke passes,
- production rollback is defined,
- legacy route is disabled, frozen, or marked read-only.
