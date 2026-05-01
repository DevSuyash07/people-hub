-- Add team lead support to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS is_team_lead boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS team_lead_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_team_lead_id ON public.employees(team_lead_id);
CREATE INDEX IF NOT EXISTS idx_employees_is_team_lead ON public.employees(is_team_lead) WHERE is_team_lead = true;

-- Prevent self-referential team lead and require lead to be flagged as team lead
CREATE OR REPLACE FUNCTION public.validate_team_lead_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.team_lead_id IS NOT NULL THEN
    IF NEW.team_lead_id = NEW.id THEN
      RAISE EXCEPTION 'An employee cannot be their own team lead';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = NEW.team_lead_id AND is_team_lead = true) THEN
      RAISE EXCEPTION 'Assigned team_lead_id must reference an employee marked as team lead';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_team_lead ON public.employees;
CREATE TRIGGER trg_validate_team_lead
  BEFORE INSERT OR UPDATE OF team_lead_id, is_team_lead ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.validate_team_lead_assignment();

-- Helper: is current user a team lead of given employee?
CREATE OR REPLACE FUNCTION public.is_team_lead_of(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees lead
    JOIN public.employees member ON member.team_lead_id = lead.id
    WHERE lead.user_id = auth.uid()
      AND lead.is_team_lead = true
      AND member.id = _employee_id
  )
$$;

-- Allow team leads to view their direct reports' employee row
CREATE POLICY "Team leads view their reports"
ON public.employees
FOR SELECT
USING (public.is_team_lead_of(id));

-- Allow team leads to view their reports' attendance
CREATE POLICY "Team leads view reports attendance"
ON public.attendance
FOR SELECT
USING (public.is_team_lead_of(employee_id));

-- Allow team leads to view their reports' tasks
CREATE POLICY "Team leads view reports tasks"
ON public.tasks
FOR SELECT
USING (public.is_team_lead_of(assigned_to));
