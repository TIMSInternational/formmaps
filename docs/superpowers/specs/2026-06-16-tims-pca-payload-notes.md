# Phase 0 — TIMS PCA payload shapes (prod, verified 2026-06-16)

Ran the three TIMS endpoints in-VPC against a real completed `pcaCod`
(`9c898159-…`, owner `andrestafur1971@gmail.com`) with the prod `PCA_COKEY`.

## `GetPcaResult` (DISC) — 3-graph matrix, NOT PcaD1..PcaD4

Returns DISC across **three graphs** (confirmed against `tims-pca-api-contract`):

| Graph | Meaning | Fields | Andres example |
|---|---|---|---|
| 1 | **Adaptación Laboral / Work Adaptation** | `PcaD1 PcaI1 PcaS1 PcaC1` | 89 / 18 / 18 / 21 |
| 2 | **Conducta Bajo Presión / Under Pressure (core)** | `PcaD2 PcaI2 PcaS2 PcaC2` | 87 / 87 / 26 / 25 |
| 3 | **Imagen Propia / Self-Image** | `PcaD3 PcaI3 PcaS3 PcaC3` | 90 / 60 / 25 / 25 |

Plus identity (`PerNom/PerApe/PerMail/PerCodExt`=userId), `PcaFec`/`PcaHor` (date), `PcaLink` (PDF report URL), `PcaImg` (chart PNG URL), `PcaCod`.

**⚠️ Correction:** the original assembly assumed `PcaD1=D, PcaD2=I, PcaD3=S, PcaD4=C`. WRONG — there is no `PcaD4`. Each graph has its own D/I/S/C. The engine should consume all three graphs; **graph 2 (Under Pressure) is the instinctive/core style** → use as the primary DISC for matching (revisitable).

## `GetCompetencesResult` — usable, `PcaCmps` array

`{ PerNom, PerEmail, PerCargo, PcaFec, PcaCmps: [{ CmpNom, Level }] }` — 11 competences, `Level` 1–4 (Spanish names): ADAPTABILIDAD AL CAMBIO, COMUNICACIÓN, CREATIVIDAD E INNOVACIÓN, EMPATÍA, HABILIDAD DE NEGOCIACIÓN, IMPACTO E INFLUENCIA, MOTIVACIÓN, PLANEACIÓN ESTRATEGICA, RELACIONES INTERPERSONALES, SOCIABILIDAD, TOMA DE DECISIONES. → surface as `{ name, level }[]`.

## `GetPcaVsJcaResult` — requires a target job code

Returns `"PCA API error: El campo 'JcaCodExt' es requerido"` without `JcaCodExt`. So **JCA gap is a per-career comparison** (PCA vs a specific job), not a base-profile field. → Do NOT call it in the base capture; the engine fetches it per matched career (Plan 3), keyed by that career's `JcaCod`. `PCAResult.jcaResult` column stays for optional caching but is not populated by base capture.

## Impact on the foundation code (corrected in follow-up commits)
- `capturePcaResults`: call DISC + Competences only (drop the base JCA call).
- `assembleCompleteProfile`: `normalizeDisc` reads the 3-graph fields; `pca` exposes `{ disc: {workAdaptation, underPressure, selfImage, primary}, competences: {name,level}[] }`; drop `jcaGap` from the base profile.
