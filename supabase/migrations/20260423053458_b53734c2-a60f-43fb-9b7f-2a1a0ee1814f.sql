
-- Enums
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late', 'half_day', 'on_leave');
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- Attendance table
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  check_in timestamptz,
  check_out timestamptz,
  status attendance_status NOT NULL DEFAULT 'present',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);

CREATE INDEX idx_attendance_employee_date ON public.attendance(employee_id, date DESC);
CREATE INDEX idx_attendance_date ON public.attendance(date DESC);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees view own attendance"
ON public.attendance FOR SELECT
USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Admin/HR view all attendance"
ON public.attendance FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

CREATE POLICY "Employees insert own attendance"
ON public.attendance FOR INSERT
WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Employees update own attendance"
ON public.attendance FOR UPDATE
USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Admin/HR manage attendance"
ON public.attendance FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

CREATE TRIGGER update_attendance_updated_at
BEFORE UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Leave types
CREATE TABLE public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  default_days numeric(5,1) NOT NULL DEFAULT 0,
  is_paid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view leave types"
ON public.leave_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/HR manage leave types"
ON public.leave_types FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

CREATE TRIGGER update_leave_types_updated_at
BEFORE UPDATE ON public.leave_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Leave balances
CREATE TABLE public.leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year int NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  allocated numeric(5,1) NOT NULL DEFAULT 0,
  used numeric(5,1) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, leave_type_id, year)
);

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees view own balances"
ON public.leave_balances FOR SELECT
USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Admin/HR view all balances"
ON public.leave_balances FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

CREATE POLICY "Admin/HR manage balances"
ON public.leave_balances FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

CREATE TRIGGER update_leave_balances_updated_at
BEFORE UPDATE ON public.leave_balances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Leave requests
CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric(5,1) NOT NULL,
  reason text,
  status leave_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leave_requests_employee ON public.leave_requests(employee_id, created_at DESC);
CREATE INDEX idx_leave_requests_status ON public.leave_requests(status);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees view own requests"
ON public.leave_requests FOR SELECT
USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Admin/HR view all requests"
ON public.leave_requests FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

CREATE POLICY "Employees create own requests"
ON public.leave_requests FOR INSERT
WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()) AND status = 'pending');

CREATE POLICY "Employees cancel own pending requests"
ON public.leave_requests FOR UPDATE
USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()) AND status = 'pending')
WITH CHECK (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "Admin/HR manage requests"
ON public.leave_requests FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

CREATE TRIGGER update_leave_requests_updated_at
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: when leave request is approved, update leave_balances.used
CREATE OR REPLACE FUNCTION public.handle_leave_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr int;
BEGIN
  yr := EXTRACT(YEAR FROM NEW.start_date);

  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.leave_balances (employee_id, leave_type_id, year, allocated, used)
    VALUES (NEW.employee_id, NEW.leave_type_id, yr, 0, NEW.days)
    ON CONFLICT (employee_id, leave_type_id, year)
    DO UPDATE SET used = leave_balances.used + NEW.days, updated_at = now();
  ELSIF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    UPDATE public.leave_balances
    SET used = GREATEST(0, used - OLD.days), updated_at = now()
    WHERE employee_id = OLD.employee_id AND leave_type_id = OLD.leave_type_id AND year = EXTRACT(YEAR FROM OLD.start_date);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_leave_request_status_change
AFTER UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_leave_approval();

-- Seed default leave types
INSERT INTO public.leave_types (name, description, default_days, is_paid) VALUES
  ('Casual Leave', 'Short notice personal leave', 12, true),
  ('Sick Leave', 'Medical / health-related leave', 10, true),
  ('Annual Leave', 'Planned vacation leave', 15, true),
  ('Unpaid Leave', 'Leave without pay', 0, false)
ON CONFLICT (name) DO NOTHING;
