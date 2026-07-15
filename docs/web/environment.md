# Environment

Environment variables will be finalized when the existing frontend is migrated.

Expected categories:

- public application URL
- FormMaps API base URL
- TIMS interop API base URL
- authentication provider settings
- analytics and telemetry keys
- feature flags

No secrets should be exposed through `NEXT_PUBLIC_*` variables.
