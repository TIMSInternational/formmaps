-- Schema-only harness for the school:manage profile + settings reads/writes (FM-DOTNET-051). Hand-authored from
-- prisma/schema.prisma with the full `schools` scalar surface the profile passthrough emits (address is jsonb;
-- there is NO `plan` column — the reader hardcodes "Standard") + the `users` columns the settings admin identity
-- and studentCount touch. NO foreign keys / RLS policies (schema-only). `status` is text here (the real DB uses the
-- SchoolStatus PG enum); the mapper casts with ::text so it reads identically on both. The fixture pins a NON-UTC
-- server timezone so the ISO-Z timestamps must not depend on the container's local tz.

CREATE TABLE "schools" (
    "id"                           text PRIMARY KEY,
    "name"                         text NOT NULL,
    "adminEmail"                   text NOT NULL,
    "contactEmail"                 text,
    "maxStudents"                  integer NOT NULL,
    "serviceHoursRequired"         integer,
    "details"                      text,
    "contractStartDate"            timestamp,
    "contractEndDate"              timestamp,
    "status"                       text NOT NULL DEFAULT 'invited',
    "invitedAt"                    timestamp,
    "invitationToken"              text,
    "invitationTokenExpiresAt"     timestamp,
    "notifyOnStudentSignup"        boolean,
    "notifyOnAssessmentComplete"   boolean,
    "allowStudentSelfRegistration" boolean,
    "logoUrl"                      text,
    "address"                      jsonb,
    "phone"                        text,
    "website"                      text,
    "timezone"                     text,
    "isActive"                     boolean NOT NULL DEFAULT true,
    "createdBy"                    text,
    "createdDate"                  timestamp NOT NULL DEFAULT now(),
    "updatedBy"                    text,
    "updatedAt"                    timestamp NOT NULL DEFAULT now(),
    "videoCallsEnabled"            boolean NOT NULL DEFAULT false
);

CREATE TABLE "users" (
    "id"       text PRIMARY KEY,
    "name"     text NOT NULL,
    "email"    text NOT NULL,
    "roleName" text NOT NULL,
    "schoolId" text,
    "isActive" boolean NOT NULL DEFAULT true
);

CREATE INDEX "schoolprofile_users_schoolId_idx" ON "users"("schoolId");
