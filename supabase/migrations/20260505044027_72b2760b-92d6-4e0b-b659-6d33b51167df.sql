
CREATE TABLE public.project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_messages_project ON public.project_messages(project_id, created_at);

ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    JOIN public.employees e ON e.id = pm.employee_id
    WHERE pm.project_id = _project_id AND e.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR public.is_admin_or_lead(auth.uid())
      OR public.is_project_member(_project_id)
$$;

CREATE POLICY "View project messages if member or admin/TL"
ON public.project_messages FOR SELECT TO authenticated
USING (public.can_access_project(project_id));

CREATE POLICY "Send project messages if member or admin/TL"
ON public.project_messages FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_project(project_id)
  AND sender_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

CREATE POLICY "Delete own project messages"
ON public.project_messages FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR sender_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.project_messages;
ALTER TABLE public.project_messages REPLICA IDENTITY FULL;
