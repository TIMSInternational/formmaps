# Interoperability Scope

FormMaps interop is about controlled data exchange, not shared internals.

## Outbound To TIMS ATS

- limited student profile packet
- consent grant reference
- eligibility context
- application handoff event

## Inbound From TIMS ATS

- eligible opportunity summaries
- application started/submitted status
- employer/partner metadata approved for FormMaps display

## Forbidden

- direct database reads across products
- raw assessment exports without explicit approval
- hidden API calls to internal TIMS ATS routes
