-- Track per-user last-read time per project chat for unread counts
CREATE TABLE public.project_chat_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id)
);

ALTER TABLE public.project_chat_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own reads"
  ON public.project_chat_reads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users upsert own reads (insert)"
  ON public.project_chat_reads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users upsert own reads (update)"
  ON public.project_chat_reads FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
