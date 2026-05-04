-- Projects table
CREATE TYPE public.project_status AS ENUM ('active', 'hold');
CREATE TYPE public.project_plan AS ENUM ('silver', 'gold', 'platinum', 'diamond', 'custom');

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_name text NOT NULL,
  website_url text,
  start_date date,
  plan project_plan NOT NULL DEFAULT 'silver',
  email text,
  phone text,
  keywords_date date,
  monthly_reporting_day smallint CHECK (monthly_reporting_day BETWEEN 1 AND 31),
  business_summary text,
  additional_info text,
  social_facebook text,
  social_instagram text,
  social_twitter text,
  social_linkedin text,
  social_youtube text,
  social_other text,
  status project_status NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_projects_updated
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Helper: is admin or team lead
CREATE OR REPLACE FUNCTION public.is_admin_or_lead(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin') OR EXISTS (
    SELECT 1 FROM public.employees WHERE user_id = _user_id AND is_team_lead = true
  )
$$;

CREATE POLICY "Authenticated view projects" ON public.projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin or TL insert projects" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_lead(auth.uid()));
CREATE POLICY "Admin or TL update projects" ON public.projects
  FOR UPDATE TO authenticated USING (public.is_admin_or_lead(auth.uid()))
  WITH CHECK (public.is_admin_or_lead(auth.uid()));
CREATE POLICY "Admin delete projects" ON public.projects
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Project members
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, employee_id)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view project members" ON public.project_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin or TL manage project members" ON public.project_members
  FOR ALL TO authenticated USING (public.is_admin_or_lead(auth.uid()))
  WITH CHECK (public.is_admin_or_lead(auth.uid()));

-- Project notifications (marquee)
CREATE TYPE public.project_notification_type AS ENUM ('hold', 'new', 'reactivated');

CREATE TABLE public.project_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type project_notification_type NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.project_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view notifications" ON public.project_notifications
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin or TL insert notifications" ON public.project_notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_lead(auth.uid()));
CREATE POLICY "Admin delete notifications" ON public.project_notifications
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Per-user dismissals so the close button is per-user
CREATE TABLE public.project_notification_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.project_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

ALTER TABLE public.project_notification_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dismissals" ON public.project_notification_dismissals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own dismissals" ON public.project_notification_dismissals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Auto-create notification when project is inserted or status changes
CREATE OR REPLACE FUNCTION public.handle_project_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.project_notifications (project_id, type, message)
    VALUES (NEW.id, 'new', 'New project added: ' || NEW.website_name);
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'hold' THEN
      INSERT INTO public.project_notifications (project_id, type, message)
      VALUES (NEW.id, 'hold', NEW.website_name || ' is on hold');
    ELSIF NEW.status = 'active' THEN
      INSERT INTO public.project_notifications (project_id, type, message)
      VALUES (NEW.id, 'reactivated', NEW.website_name || ' has been reactivated');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_status_notify
AFTER INSERT OR UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.handle_project_status_change();