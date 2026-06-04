-- OrgEnrollmentSettings: per-organization exam enrollment policies (OrgAdmin Settings page)
-- Safe to re-run.

DO $$
BEGIN
  CREATE TYPE public.org_enrollment_approval_mode_enum AS ENUM (
    'manual',
    'auto_direct_assign',
    'auto_student_requests'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public."OrgEnrollmentSettings" (
  "OrgID" uuid PRIMARY KEY
    REFERENCES public."Organizations"("OrgID") ON DELETE CASCADE,

  "AllowStudentRequests" boolean NOT NULL DEFAULT true,

  "EnrollmentApprovalMode" public.org_enrollment_approval_mode_enum
    NOT NULL DEFAULT 'auto_direct_assign',

  "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
  "UpdatedBy" uuid NULL REFERENCES public."OrgUsers"("OrgUserID") ON DELETE SET NULL
);

COMMENT ON TABLE public."OrgEnrollmentSettings" IS
  'OrgAdmin-controlled enrollment: student requests on/off and approval mode for direct assign vs student requests.';

-- Backfill existing organizations
INSERT INTO public."OrgEnrollmentSettings" ("OrgID", "AllowStudentRequests", "EnrollmentApprovalMode")
SELECT o."OrgID", true, 'auto_direct_assign'::public.org_enrollment_approval_mode_enum
FROM public."Organizations" o
WHERE NOT EXISTS (
  SELECT 1 FROM public."OrgEnrollmentSettings" s WHERE s."OrgID" = o."OrgID"
);
