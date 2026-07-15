# API Boundary

FormMaps Web may call:

- `formmaps-api` for FormMaps product data
- approved TIMS ATS endpoints defined in `tims-interop`

FormMaps Web may not:

- call TIMS ATS internal endpoints directly
- read from databases
- duplicate backend authorization rules
- send assessment or student data to TIMS ATS without an explicit consent flow

## Client Organization

```text
packages/api-client/
  formmaps/
  interop/
  generated/
```

## Feature-Flagged Routing

During migration, API clients may route a domain to the legacy Node API or the
new .NET API. The routing decision must be centralized in the API client layer.
