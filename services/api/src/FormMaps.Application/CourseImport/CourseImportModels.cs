namespace FormMaps.Application.CourseImport;

/// <summary>
/// Models for the course bulk-import CORE slice (FM-DOTNET-059 — routes/school-courses.ts, mounted under
/// /api/v1/school-admin; service schoolCoursesService.ts <c>importCourses</c> / <c>getImportJob</c>). Two endpoints
/// under one flag FORMMAPS_ROUTE_COURSE_IMPORT_TO_DOTNET: POST /courses/import (202) + GET /courses/import/:jobId
/// (200/404). The third route (/download-failures) is DEFERRED to FM-060 (stays Node).
/// </summary>

/// <summary>One parsed CSV row (produced by <see cref="ImportRowParser"/>). Truthiness is captured by presence,
/// mirroring JS: <c>Code</c>/<c>Name</c>/<c>Department</c>/<c>Description</c> are null when absent OR JSON-null; an
/// empty string is a distinct present-but-falsy value. <c>Credits</c> is the JS-coerced parseFloat INPUT (a JSON string
/// verbatim, or a truthy JSON number's text) or null when JS-falsy (absent/null/""/0). <c>GradeLevels</c> is null when
/// absent/JSON-null (JS-falsy → omitted on UPDATE, becomes [] on CREATE) but a present empty list IS JS-truthy so it is
/// written verbatim. <c>RowTypeInvalid</c> is true when a scalar carried a JSON type Prisma would REJECT (a non-string
/// department/description, a non-int gradeLevels element, or a non-string/non-number credits) → the writer fails the row
/// (matching legacy's Prisma-type-error-then-caught outcome). <c>RawJson</c> is the ORIGINAL row object serialized
/// (stored verbatim as the error rawRow jsonb).</summary>
public sealed record ImportRow(
    string? Code,
    string? Name,
    string? Department,
    string? Credits,
    IReadOnlyList<int>? GradeLevels,
    string? Description,
    bool RowTypeInvalid,
    string RawJson);

/// <summary>One entry in the in-memory validationErrors list — the wire shape { row, errors:[...] }.</summary>
public sealed record ImportValidationError(int Row, IReadOnlyList<string> Errors);

/// <summary>importCourses result — { jobId, totalRows, validRows, invalidRows, validationErrors }. validationErrors is
/// emitted from the IN-MEMORY list (never a DB round-trip).</summary>
public sealed record ImportResult(
    string JobId,
    int TotalRows,
    int ValidRows,
    int InvalidRows,
    IReadOnlyList<ImportValidationError> ValidationErrors);

/// <summary>getImportJob view — { jobId, status, totalRows, processedRows, failedRows, validationErrors, completedAt }.
/// validationErrors is deserialized from the stored jsonb into the structured [{row,errors}] list then re-emitted (NO
/// raw ::text passthrough — Postgres jsonb::text adds ": "/", " spacing that diverges from Node res.json). completedAt
/// is ISO-8601 UTC with milliseconds + 'Z', or null.</summary>
public sealed record ImportJobView(
    string JobId,
    string Status,
    int TotalRows,
    int ProcessedRows,
    int FailedRows,
    IReadOnlyList<ImportValidationError> ValidationErrors,
    string? CompletedAt);
