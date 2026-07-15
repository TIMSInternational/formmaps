# Repository Strategy

## Decision

Use one repository per product:

```text
TIMSInternational/formmaps
TIMSInternational/tims-ats
TIMSInternational/tims-interop
```

## Rationale

FormMaps frontend and backend will change together during the migration from the
legacy Node API to .NET 10. A product monorepo keeps those coordinated changes
in one pull request and one review.

`tims-interop` stays separate because it is not product code. It defines
contracts between products.

## Superseded Repositories

These repos were created during initial exploration and should not receive new
product work:

```text
TIMSInternational/formmaps-web
TIMSInternational/formmaps-api
```

They are not deleted so no history is lost, but the active FormMaps destination
is `TIMSInternational/formmaps`.
