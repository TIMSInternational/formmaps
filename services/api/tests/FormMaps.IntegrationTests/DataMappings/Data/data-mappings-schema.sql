-- Schema-only harness for the school:data-mapping reads/writes (FM-DOTNET-056). Hand-authored from
-- prisma/schema.prisma / migrations/20260505140750_init: the two native enums DataMappingSource / DataMappingStatus
-- and the data_mappings table, with the @@unique index the POST duplicate-path depends on. NO foreign keys / RLS
-- policies (schema-only). confidence uses the Prisma DECIMAL(65,30); the reader/writer emit it via
-- trim_scale("confidence")::text so it reads back as a decimal.js JSON string (raw Prisma Decimal passthrough —
-- FM-054/055 finding); source/status emit as their native-enum labels via ::text. The fixture pins a NON-UTC server
-- timezone so the ISO-Z timestamps must not depend on the container's local tz.

CREATE TYPE "DataMappingStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "DataMappingSource" AS ENUM ('manual', 'ai_suggested');

CREATE TABLE "data_mappings" (
    "id"               text PRIMARY KEY,
    "schoolId"         text NOT NULL,
    "externalCode"     text NOT NULL,
    "externalName"     text,
    "externalSource"   text NOT NULL,
    "internalCourseId" text NOT NULL,
    "confidence"       decimal(65,30),
    "source"           "DataMappingSource" NOT NULL DEFAULT 'manual',
    "status"           "DataMappingStatus" NOT NULL DEFAULT 'pending',
    "approvedBy"       text,
    "approvedAt"       timestamp,
    "isActive"         boolean NOT NULL DEFAULT true,
    "createdBy"        text,
    "createdDate"      timestamp NOT NULL DEFAULT now(),
    "updatedBy"        text,
    "updatedAt"        timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "data_mappings_schoolId_externalCode_externalSource_key"
    ON "data_mappings"("schoolId", "externalCode", "externalSource");
