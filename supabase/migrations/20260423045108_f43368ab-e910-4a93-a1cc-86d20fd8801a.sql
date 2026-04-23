
-- =========================
-- Roles
-- =========================
create type public.app_role as enum ('admin', 'hr', 'employee');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.get_primary_role(_user_id uuid)
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles
  where user_id = _user_id
  order by case role when 'admin' then 1 when 'hr' then 2 else 3 end
  limit 1
$$;

create policy "Users can view their own roles"
  on public.user_roles for select
  using (auth.uid() = user_id);

create policy "Admins can view all roles"
  on public.user_roles for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can manage roles"
  on public.user_roles for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =========================
-- Timestamps helper
-- =========================
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================
-- Departments
-- =========================
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.departments enable row level security;

create trigger trg_departments_updated_at
before update on public.departments
for each row execute function public.update_updated_at_column();

create policy "Authenticated can view departments"
  on public.departments for select
  to authenticated using (true);

create policy "Admin/HR can manage departments"
  on public.departments for all
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'hr'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'hr'));

-- =========================
-- Employees
-- =========================
create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'intern');
create type public.employee_status as enum ('active', 'inactive', 'terminated');

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  avatar_url text,
  date_of_birth date,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  department_id uuid references public.departments(id) on delete set null,
  designation text,
  employment_type employment_type default 'full_time',
  joining_date date,
  exit_date date,
  exit_reason text,
  status employee_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employees enable row level security;

create trigger trg_employees_updated_at
before update on public.employees
for each row execute function public.update_updated_at_column();

create index idx_employees_department on public.employees(department_id);
create index idx_employees_status on public.employees(status);

create policy "Employees can view own record"
  on public.employees for select
  using (auth.uid() = user_id);

create policy "Admin/HR can view all employees"
  on public.employees for select
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'hr'));

create policy "Employees can update own basic profile"
  on public.employees for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Admin/HR can insert employees"
  on public.employees for insert
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'hr'));

create policy "Admin/HR can update any employee"
  on public.employees for update
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'hr'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'hr'));

create policy "Admin can delete employees"
  on public.employees for delete
  using (public.has_role(auth.uid(), 'admin'));

-- =========================
-- Auto-create employee row + employee role on signup
-- =========================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.employees (user_id, full_name, email, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'active'
  )
  on conflict (email) do update set user_id = excluded.user_id;

  insert into public.user_roles (user_id, role)
  values (new.id, 'employee')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================
-- Seed departments
-- =========================
insert into public.departments (name, description) values
  ('Engineering', 'Software engineering and development'),
  ('Human Resources', 'People operations and culture'),
  ('Design', 'Product and brand design'),
  ('Marketing', 'Growth and communications'),
  ('Operations', 'Internal operations and admin');
