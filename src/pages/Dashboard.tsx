import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Users, Building2, UserCheck, UserX, ArrowUpRight } from "lucide-react";

interface Stats {
  total: number;
  active: number;
  inactive: number;
  departments: number;
}

export default function Dashboard() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, inactive: 0, departments: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    document.title = "Dashboard · Digi Captain CRM";
    load();
  }, [user, role]);

  async function load() {
    if (role === "admin" || role === "hr") {
      const [{ data: emps }, { count: dCount }] = await Promise.all([
        supabase.from("employees").select("id, full_name, designation, status, created_at, department:departments(name)").order("created_at", { ascending: false }),
        supabase.from("departments").select("*", { count: "exact", head: true }),
      ]);
      const list = emps ?? [];
      setStats({
        total: list.length,
        active: list.filter((e: any) => e.status === "active").length,
        inactive: list.filter((e: any) => e.status !== "active").length,
        departments: dCount ?? 0,
      });
      setRecent(list.slice(0, 5));
    } else if (user) {
      const { data } = await supabase
        .from("employees")
        .select("*, department:departments(name)")
        .eq("user_id", user.id)
        .maybeSingle();
      setMe(data);
    }
  }

  if (role === "employee") return <EmployeeDashboard me={me} email={user?.email} />;

  return (
    <AppLayout>
      <PageHeader
        eyebrow={role === "admin" ? "Administrator" : "Human Resources"}
        title="Today at a glance"
        description="A snapshot of your team. Calm, and current."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard label="Total people" value={stats.total} icon={Users} />
        <StatCard label="Active" value={stats.active} icon={UserCheck} accent />
        <StatCard label="Inactive" value={stats.inactive} icon={UserX} />
        <StatCard label="Departments" value={stats.departments} icon={Building2} />
      </div>

      <div className="surface-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-lg">Recently added</h3>
            <p className="text-xs text-muted-foreground mt-0.5">The latest additions to your team</p>
          </div>
          <a href="/employees" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            View all <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
        {recent.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No employees yet. Head to the Employees tab to add your first person.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((e: any) => (
              <li key={e.id} className="px-6 py-4 flex items-center justify-between hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-accent-soft text-accent flex items-center justify-center text-sm font-medium shrink-0">
                    {e.full_name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{e.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {e.designation || "—"} · {e.department?.name || "Unassigned"}
                    </div>
                  </div>
                </div>
                <StatusPill status={e.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}

function EmployeeDashboard({ me, email }: { me: any; email?: string }) {
  return (
    <AppLayout>
      <PageHeader
        eyebrow={`Hello${me?.full_name ? `, ${me.full_name.split(" ")[0]}` : ""}`}
        title="Welcome back"
        description="Your personal workspace. More tools arrive as your team grows."
      />

      <div className="grid md:grid-cols-3 gap-4 mb-10">
        <div className="stat-card">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Department</div>
          <div className="font-display text-3xl mt-3">{me?.department?.name ?? "—"}</div>
        </div>
        <div className="stat-card">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Designation</div>
          <div className="font-display text-3xl mt-3">{me?.designation ?? "—"}</div>
        </div>
        <div className="stat-card">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Status</div>
          <div className="mt-3"><StatusPill status={me?.status ?? "active"} large /></div>
        </div>
      </div>

      <div className="surface-card p-8">
        <h3 className="text-2xl mb-2">Your details</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Keep your contact info current — head to <a href="/profile" className="underline underline-offset-4 hover:text-accent">My Profile</a> to edit.
        </p>
        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <Row label="Full name" value={me?.full_name ?? "—"} />
          <Row label="Email" value={email ?? me?.email ?? "—"} />
          <Row label="Phone" value={me?.phone ?? "—"} />
          <Row label="Joining date" value={me?.joining_date ?? "—"} />
        </dl>
      </div>
    </AppLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent?: boolean }) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className={`h-8 w-8 rounded-md flex items-center justify-center ${accent ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="font-display text-5xl mt-4 font-mono-tabular">{value}</div>
    </div>
  );
}

export function StatusPill({ status, large }: { status: string; large?: boolean }) {
  const map: Record<string, string> = {
    active: "bg-success/10 text-success border-success/20",
    inactive: "bg-muted text-muted-foreground border-border",
    terminated: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 ${large ? "py-1 text-sm" : "py-0.5 text-xs"} capitalize ${map[status] ?? map.inactive}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
