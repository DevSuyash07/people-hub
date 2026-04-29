-- Per-employee scheduled check-in
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS scheduled_check_in time NOT NULL DEFAULT '09:00:00';

-- Add 'leave' to attendance_status enum if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'leave'
      AND enumtypid = 'public.attendance_status'::regtype
  ) THEN
    ALTER TYPE public.attendance_status ADD VALUE 'leave';
  END IF;
END $$;

-- Allow admin/HR to update any attendance row
DROP POLICY IF EXISTS "Admin/HR update any attendance" ON public.attendance;
CREATE POLICY "Admin/HR update any attendance"
  ON public.attendance FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role));

-- Allow admin/HR to insert attendance for anyone
DROP POLICY IF EXISTS "Admin/HR insert any attendance" ON public.attendance;
CREATE POLICY "Admin/HR insert any attendance"
  ON public.attendance FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role));