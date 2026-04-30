-- Enums
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed');

-- Tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  status public.task_status NOT NULL DEFAULT 'pending',
  due_date DATE,
  assigned_to UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Helper: is current user the assignee or creator of a task row?
CREATE OR REPLACE FUNCTION public.is_task_participant(_task_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.employees e ON e.id = t.assigned_to OR e.id = t.assigned_by
    WHERE t.id = _task_id AND e.user_id = auth.uid()
  )
$$;

-- Tasks RLS
CREATE POLICY "Admin/HR view all tasks" ON public.tasks
FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

CREATE POLICY "Employees view own tasks" ON public.tasks
FOR SELECT USING (
  assigned_to IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  OR assigned_by IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

CREATE POLICY "Admin/HR create any task" ON public.tasks
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

CREATE POLICY "Employees create self tasks" ON public.tasks
FOR INSERT WITH CHECK (
  assigned_to IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND assigned_by IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

CREATE POLICY "Admin/HR update any task" ON public.tasks
FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

CREATE POLICY "Employees update own task status" ON public.tasks
FOR UPDATE USING (
  assigned_to IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
) WITH CHECK (
  assigned_to IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

CREATE POLICY "Admin/HR delete tasks" ON public.tasks
FOR DELETE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

-- updated_at trigger
CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
CREATE TABLE public.task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_comments_task ON public.task_comments(task_id);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View comments on accessible tasks" ON public.task_comments
FOR SELECT USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr')
  OR public.is_task_participant(task_id)
);

CREATE POLICY "Add comments on accessible tasks" ON public.task_comments
FOR INSERT WITH CHECK (
  author_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr')
    OR public.is_task_participant(task_id)
  )
);

CREATE POLICY "Author or admin delete comments" ON public.task_comments
FOR DELETE USING (
  has_role(auth.uid(), 'admin')
  OR author_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- Attachments
CREATE TABLE public.task_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_attachments_task ON public.task_attachments(task_id);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View attachments on accessible tasks" ON public.task_attachments
FOR SELECT USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr')
  OR public.is_task_participant(task_id)
);

CREATE POLICY "Add attachments on accessible tasks" ON public.task_attachments
FOR INSERT WITH CHECK (
  uploaded_by IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  AND (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr')
    OR public.is_task_participant(task_id)
  )
);

CREATE POLICY "Uploader or admin delete attachments" ON public.task_attachments
FOR DELETE USING (
  has_role(auth.uid(), 'admin')
  OR uploaded_by IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- Storage bucket for task files (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: path layout = <task_id>/<filename>
CREATE POLICY "Task files: read accessible"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'task-attachments' AND (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr')
    OR public.is_task_participant(((storage.foldername(name))[1])::uuid)
  )
);

CREATE POLICY "Task files: upload accessible"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'task-attachments' AND (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr')
    OR public.is_task_participant(((storage.foldername(name))[1])::uuid)
  )
);

CREATE POLICY "Task files: delete accessible"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'task-attachments' AND (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr')
    OR public.is_task_participant(((storage.foldername(name))[1])::uuid)
  )
);