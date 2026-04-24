-- Holidays table
CREATE TABLE public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (name, holiday_date)
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view holidays"
  ON public.holidays FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin/HR manage holidays"
  ON public.holidays FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

CREATE TRIGGER update_holidays_updated_at
  BEFORE UPDATE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Calendar events table
CREATE TYPE public.event_type AS ENUM ('meeting', 'training', 'celebration', 'announcement', 'other');

CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  end_date DATE,
  event_type public.event_type NOT NULL DEFAULT 'other',
  location TEXT,
  is_company_wide BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view company events"
  ON public.calendar_events FOR SELECT
  TO authenticated
  USING (is_company_wide = true);

CREATE POLICY "Admin/HR manage events"
  ON public.calendar_events FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_holidays_date ON public.holidays(holiday_date);
CREATE INDEX idx_events_date ON public.calendar_events(event_date);

-- Seed sample holidays for current year
INSERT INTO public.holidays (name, holiday_date, is_recurring, description) VALUES
  ('New Year''s Day', (EXTRACT(YEAR FROM CURRENT_DATE)::text || '-01-01')::date, true, 'Public Holiday'),
  ('Independence Day', (EXTRACT(YEAR FROM CURRENT_DATE)::text || '-08-15')::date, true, 'National Holiday'),
  ('Republic Day', (EXTRACT(YEAR FROM CURRENT_DATE)::text || '-01-26')::date, true, 'National Holiday'),
  ('Christmas Day', (EXTRACT(YEAR FROM CURRENT_DATE)::text || '-12-25')::date, true, 'Public Holiday')
ON CONFLICT (name, holiday_date) DO NOTHING;