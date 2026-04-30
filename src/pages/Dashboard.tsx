import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Users, Building2, UserCheck, UserX, ArrowUpRight,
  CalendarCheck, CalendarX, Clock, AlertCircle, Cake, PartyPopper,
  CalendarDays, UserPlus, UserMinus, Check, X, CheckSquare, Timer, LogIn, LogOut as LogOutIcon,
} from "lucide-react";
import { format, differenceInCalendarDays, isSameMonth, isSameDay, addDays, startOfDay, startOfMonth, endOfMonth } from "date-fns";
import { computeAttendanceStatus, workedHours } from "@/lib/attendance";

export default function Dashboard() {
  const { user, role } = useAuth();
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    document.title = "Dashboard · Digi Captain CRM";
    if (role === "employee" && user) loadMe();
  }, [user, role]);

  async function loadMe() {
    const { data } = await supabase
      .from("employees")
      .select("*, department:departments(name)")
      .eq("user_id", user!.id)
      .maybeSingle();
    setMe(data);
  }

  if (role === "admin") return <AdminDashboard />;
  if (role === "hr") return <HrDashboard />;
  return <EmployeeDashboard me={me} email={user?.email} />;
}

/* ============================== ADMIN ============================== */

interface AdminStats {
  total: number;
  activeToday: number;
  onLeaveToday: number;
  pendingApprovals: number;
  departments: number;
  newJoiners30: number;
  exits30: number;
  upcomingHolidays7: number;
}

function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats>({
    total: 0, activeToday: 0, onLeaveToday: 0, pendingApprovals: 0,
    departments: 0, newJoiners30: 0, exits30: 0, upcomingHolidays7: 0,
  });
  const [pending, setPending] = useState<any[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<{ present: number; absent: number; leave: number; total: number }>({ present: 0, absent: 0, leave: 0, total: 0 });
  const [lateToday, setLateToday] = useState<any[]>([]);
  const [missingCheckout, setMissingCheckout] = useState<any[]>([]);
  const [birthdays, setBirthdays] = useState<any[]>([]);
  const [anniversaries, setAnniversaries] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(addDays(new Date(), -1), "yyyy-MM-dd");
    const thirtyDaysAgo = format(addDays(new Date(), -30), "yyyy-MM-dd");
    const in7 = format(addDays(new Date(), 7), "yyyy-MM-dd");
    const in14 = format(addDays(new Date(), 14), "yyyy-MM-dd");
    const lateThreshold = "10:00:00"; // 10 AM

    const [
      emps, deps, att, attY, pend, hol, evts,
    ] = await Promise.all([
      supabase.from("employees").select("id, full_name, email, date_of_birth, joining_date, exit_date, status, created_at, department:departments(name)"),
      supabase.from("departments").select("id", { count: "exact", head: true }),
      supabase.from("attendance").select("id, employee_id, check_in, check_out, status, employee:employees(full_name)").eq("date", today),
      supabase.from("attendance").select("id, employee_id, check_in, check_out, employee:employees(full_name)").eq("date", yesterday),
      supabase.from("leave_requests")
        .select("id, start_date, end_date, days, reason, status, created_at, leave_type:leave_types(name), employee:employees(id, full_name, email)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase.from("holidays").select("id, name, holiday_date").gte("holiday_date", today).lte("holiday_date", in14).order("holiday_date"),
      supabase.from("calendar_events").select("id, title, event_date, event_type, location").gte("event_date", today).lte("event_date", in14).order("event_date"),
    ]);

    const employees = emps.data ?? [];
    const departments = deps.count ?? 0;
    const attToday = att.data ?? [];
    const attYest = attY.data ?? [];
    const pendingList = pend.data ?? [];
    const holidays = hol.data ?? [];
    const events = evts.data ?? [];

    // Active employees on today leave
    const { data: onLeaveRows } = await supabase
      .from("leave_requests")
      .select("id, employee_id, employee:employees(full_name)")
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today);
    const onLeaveToday = (onLeaveRows ?? []).length;

    // Upcoming holidays in 7 days
    const upcomingHolidays7 = holidays.filter((h: any) => h.holiday_date <= in7).length;

    // New joiners / exits (last 30 days)
    const newJoiners30 = employees.filter((e: any) => e.joining_date && e.joining_date >= thirtyDaysAgo).length;
    const exits30 = employees.filter((e: any) => e.exit_date && e.exit_date >= thirtyDaysAgo).length;

    // Today attendance snapshot
    const presentCount = attToday.filter((a: any) => a.status === "present" || a.status === "late").length;
    const attLeaveCount = attToday.filter((a: any) => a.status === "on_leave" || a.status === "leave").length;
    const totalActive = employees.filter((e: any) => e.status === "active").length;
    const absentCount = Math.max(0, totalActive - presentCount - onLeaveToday);

    // Late today (check_in after threshold)
    const late = attToday
      .filter((a: any) => a.check_in && format(new Date(a.check_in), "HH:mm:ss") > lateThreshold)
      .slice(0, 6);

    // Missing checkout yesterday (has check_in but no check_out)
    const missing = attYest.filter((a: any) => a.check_in && !a.check_out).slice(0, 6);

    // Birthdays & anniversaries this week (next 7 days, match MM-DD)
    const now = startOfDay(new Date());
    const bdays: any[] = [];
    const annis: any[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(now, i);
      const md = format(d, "MM-dd");
      employees.forEach((e: any) => {
        if (e.status !== "active") return;
        if (e.date_of_birth && format(new Date(e.date_of_birth), "MM-dd") === md) {
          bdays.push({ ...e, upcoming_date: d });
        }
        if (e.joining_date && format(new Date(e.joining_date), "MM-dd") === md) {
          const years = new Date().getFullYear() - new Date(e.joining_date).getFullYear();
          if (years > 0) annis.push({ ...e, upcoming_date: d, years });
        }
      });
    }

    // Upcoming 14 days: merge holidays + events
    const merged = [
      ...holidays.map((h: any) => ({ id: `h-${h.id}`, title: h.name, date: h.holiday_date, kind: "holiday" as const })),
      ...events.map((e: any) => ({ id: `e-${e.id}`, title: e.title, date: e.event_date, kind: "event" as const, location: e.location, event_type: e.event_type })),
    ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);

    setStats({
      total: employees.length,
      activeToday: presentCount,
      onLeaveToday,
      pendingApprovals: pendingList.length,
      departments,
      newJoiners30,
      exits30,
      upcomingHolidays7,
    });
    setPending(pendingList.slice(0, 6));
    setTodayAttendance({ present: presentCount, absent: absentCount, leave: onLeaveToday, total: totalActive });
    setLateToday(late);
    setMissingCheckout(missing);
    setBirthdays(bdays);
    setAnniversaries(annis);
    setUpcoming(merged);
  }

  async function review(id: string, status: "approved" | "rejected") {
    const { error } = await supabase
      .from("leave_requests")
      .update({ status, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    toast({ title: `Request ${status}` });
    load();
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Administrator"
        title="Command center"
        description="Everything you need to act on, in one place."
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total people" value={stats.total} icon={Users} />
        <StatCard label="Active today" value={stats.activeToday} icon={UserCheck} accent />
        <StatCard label="On leave today" value={stats.onLeaveToday} icon={CalendarX} />
        <StatCard label="Pending approvals" value={stats.pendingApprovals} icon={AlertCircle} highlight={stats.pendingApprovals > 0} />
        <StatCard label="Departments" value={stats.departments} icon={Building2} />
        <StatCard label="New joiners (30d)" value={stats.newJoiners30} icon={UserPlus} />
        <StatCard label="Exits (30d)" value={stats.exits30} icon={UserMinus} />
        <StatCard label="Holidays (7d)" value={stats.upcomingHolidays7} icon={CalendarDays} />
      </div>

      {/* Row: Pending approvals + Today attendance */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="surface-card overflow-hidden lg:col-span-2">
          <SectionHeader
            title="Pending leave approvals"
            subtitle="Act on these directly from your dashboard"
            href="/leave"
          />
          {pending.length === 0 ? (
            <EmptyState text="No pending requests. You're all caught up." />
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((r: any) => (
                <li key={r.id} className="px-6 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.employee?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.leave_type?.name} · {format(new Date(r.start_date), "MMM d")} → {format(new Date(r.end_date), "MMM d")} · {r.days}d
                    </div>
                    {r.reason && <div className="text-xs text-muted-foreground mt-1 line-clamp-1">"{r.reason}"</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => review(r.id, "rejected")}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" onClick={() => review(r.id, "approved")}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card overflow-hidden">
          <SectionHeader title="Today's attendance" subtitle={format(new Date(), "EEEE, MMM d")} href="/attendance" />
          <div className="p-6 space-y-4">
            <AttendanceRow label="Present" value={todayAttendance.present} total={todayAttendance.total} tone="success" />
            <AttendanceRow label="On leave" value={todayAttendance.leave} total={todayAttendance.total} tone="accent" />
            <AttendanceRow label="Absent" value={todayAttendance.absent} total={todayAttendance.total} tone="muted" />
          </div>
        </div>
      </div>

      {/* Row: Late + Missing checkout */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="surface-card overflow-hidden">
          <SectionHeader title="Late check-ins today" subtitle="After 10:00 AM" icon={Clock} />
          {lateToday.length === 0 ? (
            <EmptyState text="Nobody's late today." />
          ) : (
            <ul className="divide-y divide-border">
              {lateToday.map((a: any) => (
                <li key={a.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="text-sm font-medium truncate">{a.employee?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground font-mono-tabular">
                    {format(new Date(a.check_in), "HH:mm")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card overflow-hidden">
          <SectionHeader title="Missing check-outs" subtitle="Yesterday — needs correction" icon={AlertCircle} />
          {missingCheckout.length === 0 ? (
            <EmptyState text="All check-outs recorded." />
          ) : (
            <ul className="divide-y divide-border">
              {missingCheckout.map((a: any) => (
                <li key={a.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="text-sm font-medium truncate">{a.employee?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground font-mono-tabular">
                    in {format(new Date(a.check_in), "HH:mm")} · no out
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Row: Birthdays/Anniversaries + Upcoming */}
      <div className="grid lg:grid-cols-2 gap-4 mb-10">
        <div className="surface-card overflow-hidden">
          <SectionHeader title="This week" subtitle="Birthdays & work anniversaries" icon={Cake} />
          {birthdays.length === 0 && anniversaries.length === 0 ? (
            <EmptyState text="Nothing to celebrate this week." />
          ) : (
            <ul className="divide-y divide-border">
              {birthdays.map((e: any) => (
                <li key={`b-${e.id}`} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                      <Cake className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{e.full_name}</div>
                      <div className="text-xs text-muted-foreground">Birthday · {format(e.upcoming_date, "EEE, MMM d")}</div>
                    </div>
                  </div>
                </li>
              ))}
              {anniversaries.map((e: any) => (
                <li key={`a-${e.id}`} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                      <PartyPopper className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{e.full_name}</div>
                      <div className="text-xs text-muted-foreground">{e.years}y anniversary · {format(e.upcoming_date, "EEE, MMM d")}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card overflow-hidden">
          <SectionHeader title="Upcoming (14 days)" subtitle="Holidays & company events" icon={CalendarDays} href="/calendar" />
          {upcoming.length === 0 ? (
            <EmptyState text="Nothing on the calendar." />
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((u: any) => {
                const d = new Date(u.date);
                const diff = differenceInCalendarDays(d, new Date());
                const rel = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : `In ${diff}d`;
                return (
                  <li key={u.id} className="px-6 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-8 w-8 rounded-md flex items-center justify-center text-xs font-medium ${u.kind === "holiday" ? "bg-success/10 text-success" : "bg-accent-soft text-accent"}`}>
                        {format(d, "dd")}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{u.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {u.kind === "holiday" ? "Holiday" : `Event${u.location ? ` · ${u.location}` : ""}`} · {format(d, "EEE, MMM d")}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{rel}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

/* ============================== HR ============================== */

interface HrStats {
  total: number;
  activeToday: number;
  onLeaveToday: number;
  pendingApprovals: number;
  departments: number;
  upcomingHolidays7: number;
}

function HrDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<HrStats>({
    total: 0, activeToday: 0, onLeaveToday: 0, pendingApprovals: 0,
    departments: 0, upcomingHolidays7: 0,
  });
  const [pending, setPending] = useState<any[]>([]);
  const [todayAttendance, setTodayAttendance] = useState({ present: 0, absent: 0, leave: 0, total: 0 });
  const [lateToday, setLateToday] = useState<any[]>([]);
  const [missingCheckout, setMissingCheckout] = useState<any[]>([]);
  const [birthdays, setBirthdays] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(addDays(new Date(), -1), "yyyy-MM-dd");
    const in7 = format(addDays(new Date(), 7), "yyyy-MM-dd");
    const in14 = format(addDays(new Date(), 14), "yyyy-MM-dd");
    const lateThreshold = "10:00:00";

    const [emps, deps, att, attY, pend, hol, evts] = await Promise.all([
      supabase.from("employees").select("id, full_name, email, date_of_birth, joining_date, status, department:departments(name)"),
      supabase.from("departments").select("id", { count: "exact", head: true }),
      supabase.from("attendance").select("id, employee_id, check_in, check_out, status, employee:employees(full_name)").eq("date", today),
      supabase.from("attendance").select("id, employee_id, check_in, check_out, employee:employees(full_name)").eq("date", yesterday),
      supabase.from("leave_requests")
        .select("id, start_date, end_date, days, reason, status, created_at, leave_type:leave_types(name), employee:employees(id, full_name, email)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase.from("holidays").select("id, name, holiday_date").gte("holiday_date", today).lte("holiday_date", in14).order("holiday_date"),
      supabase.from("calendar_events").select("id, title, event_date, event_type, location").gte("event_date", today).lte("event_date", in14).order("event_date"),
    ]);

    const employees = emps.data ?? [];
    const attToday = att.data ?? [];
    const attYest = attY.data ?? [];
    const pendingList = pend.data ?? [];
    const holidays = hol.data ?? [];
    const events = evts.data ?? [];

    const { data: onLeaveRows } = await supabase
      .from("leave_requests")
      .select("id")
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today);
    const onLeaveToday = (onLeaveRows ?? []).length;

    const presentCount = attToday.filter((a: any) => a.status === "present" || a.status === "late").length;
    const totalActive = employees.filter((e: any) => e.status === "active").length;
    const absentCount = Math.max(0, totalActive - presentCount - onLeaveToday);

    const late = attToday
      .filter((a: any) => a.check_in && format(new Date(a.check_in), "HH:mm:ss") > lateThreshold)
      .slice(0, 6);
    const missing = attYest.filter((a: any) => a.check_in && !a.check_out).slice(0, 6);

    const now = startOfDay(new Date());
    const bdays: any[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(now, i);
      const md = format(d, "MM-dd");
      employees.forEach((e: any) => {
        if (e.status !== "active") return;
        if (e.date_of_birth && format(new Date(e.date_of_birth), "MM-dd") === md) {
          bdays.push({ ...e, upcoming_date: d });
        }
      });
    }

    const merged = [
      ...holidays.map((h: any) => ({ id: `h-${h.id}`, title: h.name, date: h.holiday_date, kind: "holiday" as const })),
      ...events.map((e: any) => ({ id: `e-${e.id}`, title: e.title, date: e.event_date, kind: "event" as const, location: e.location })),
    ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);

    setStats({
      total: employees.length,
      activeToday: presentCount,
      onLeaveToday,
      pendingApprovals: pendingList.length,
      departments: deps.count ?? 0,
      upcomingHolidays7: holidays.filter((h: any) => h.holiday_date <= in7).length,
    });
    setPending(pendingList.slice(0, 6));
    setTodayAttendance({ present: presentCount, absent: absentCount, leave: onLeaveToday, total: totalActive });
    setLateToday(late);
    setMissingCheckout(missing);
    setBirthdays(bdays);
    setUpcoming(merged);
  }

  async function review(id: string, status: "approved" | "rejected") {
    const { error } = await supabase
      .from("leave_requests")
      .update({ status, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    toast({ title: `Request ${status}` });
    load();
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Human Resources"
        title="Today at a glance"
        description="Approve, monitor and act — without leaving this page."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="Total people" value={stats.total} icon={Users} />
        <StatCard label="Active today" value={stats.activeToday} icon={UserCheck} accent />
        <StatCard label="On leave" value={stats.onLeaveToday} icon={CalendarX} />
        <StatCard label="Pending" value={stats.pendingApprovals} icon={AlertCircle} highlight={stats.pendingApprovals > 0} />
        <StatCard label="Departments" value={stats.departments} icon={Building2} />
        <StatCard label="Holidays (7d)" value={stats.upcomingHolidays7} icon={CalendarDays} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="surface-card overflow-hidden lg:col-span-2">
          <SectionHeader title="Pending leave approvals" subtitle="Act on these directly" href="/leave" />
          {pending.length === 0 ? (
            <EmptyState text="No pending requests." />
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((r: any) => (
                <li key={r.id} className="px-6 py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.employee?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.leave_type?.name} · {format(new Date(r.start_date), "MMM d")} → {format(new Date(r.end_date), "MMM d")} · {r.days}d
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => review(r.id, "rejected")}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" onClick={() => review(r.id, "approved")}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card overflow-hidden">
          <SectionHeader title="Today's attendance" subtitle={format(new Date(), "EEEE, MMM d")} href="/attendance" />
          <div className="p-6 space-y-4">
            <AttendanceRow label="Present" value={todayAttendance.present} total={todayAttendance.total} tone="success" />
            <AttendanceRow label="On leave" value={todayAttendance.leave} total={todayAttendance.total} tone="accent" />
            <AttendanceRow label="Absent" value={todayAttendance.absent} total={todayAttendance.total} tone="muted" />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="surface-card overflow-hidden">
          <SectionHeader title="Late check-ins today" subtitle="After 10:00 AM" icon={Clock} />
          {lateToday.length === 0 ? (
            <EmptyState text="Nobody's late today." />
          ) : (
            <ul className="divide-y divide-border">
              {lateToday.map((a: any) => (
                <li key={a.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="text-sm font-medium truncate">{a.employee?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground font-mono-tabular">{format(new Date(a.check_in), "HH:mm")}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card overflow-hidden">
          <SectionHeader title="Missing check-outs" subtitle="Yesterday" icon={AlertCircle} />
          {missingCheckout.length === 0 ? (
            <EmptyState text="All check-outs recorded." />
          ) : (
            <ul className="divide-y divide-border">
              {missingCheckout.map((a: any) => (
                <li key={a.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="text-sm font-medium truncate">{a.employee?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground font-mono-tabular">in {format(new Date(a.check_in), "HH:mm")} · no out</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-10">
        <div className="surface-card overflow-hidden">
          <SectionHeader title="Birthdays this week" icon={Cake} />
          {birthdays.length === 0 ? (
            <EmptyState text="None this week." />
          ) : (
            <ul className="divide-y divide-border">
              {birthdays.map((e: any) => (
                <li key={`b-${e.id}`} className="px-6 py-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                    <Cake className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{e.full_name}</div>
                    <div className="text-xs text-muted-foreground">{format(e.upcoming_date, "EEE, MMM d")}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card overflow-hidden">
          <SectionHeader title="Upcoming (14 days)" subtitle="Holidays & events" icon={CalendarDays} href="/calendar" />
          {upcoming.length === 0 ? (
            <EmptyState text="Nothing on the calendar." />
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((u: any) => {
                const d = new Date(u.date);
                const diff = differenceInCalendarDays(d, new Date());
                const rel = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : `In ${diff}d`;
                return (
                  <li key={u.id} className="px-6 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-8 w-8 rounded-md flex items-center justify-center text-xs font-medium ${u.kind === "holiday" ? "bg-success/10 text-success" : "bg-accent-soft text-accent"}`}>
                        {format(d, "dd")}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{u.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {u.kind === "holiday" ? "Holiday" : "Event"} · {format(d, "EEE, MMM d")}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{rel}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

/* ============================== EMPLOYEE ============================== */

function EmployeeDashboard({ me, email }: { me: any; email?: string }) {
  const [todayAtt, setTodayAtt] = useState<any>(null);
  const [monthStats, setMonthStats] = useState({ present: 0, late: 0, leave: 0, hours: 0, workdays: 0 });
  const [leaveBal, setLeaveBal] = useState({ allocated: 0, used: 0 });
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskCounts, setTaskCounts] = useState({ pending: 0, inProgress: 0, overdue: 0 });
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [recentLeaves, setRecentLeaves] = useState<any[]>([]);

  useEffect(() => { if (me?.id) load(); }, [me?.id]);

  async function load() {
    const today = format(new Date(), "yyyy-MM-dd");
    const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
    const in14 = format(addDays(new Date(), 14), "yyyy-MM-dd");
    const year = new Date().getFullYear();

    const [att, mAtt, bal, tks, hol, evts, lvs] = await Promise.all([
      supabase.from("attendance").select("*").eq("employee_id", me.id).eq("date", today).maybeSingle(),
      supabase.from("attendance").select("*").eq("employee_id", me.id).gte("date", monthStart).lte("date", monthEnd),
      supabase.from("leave_balances").select("allocated, used").eq("employee_id", me.id).eq("year", year),
      supabase.from("tasks").select("id, title, priority, status, due_date").eq("assigned_to", me.id).neq("status", "completed").order("due_date", { ascending: true, nullsFirst: false }).limit(5),
      supabase.from("holidays").select("id, name, holiday_date").gte("holiday_date", today).lte("holiday_date", in14).order("holiday_date"),
      supabase.from("calendar_events").select("id, title, event_date, location").gte("event_date", today).lte("event_date", in14).order("event_date"),
      supabase.from("leave_requests").select("id, start_date, end_date, days, status, leave_type:leave_types(name)").eq("employee_id", me.id).order("created_at", { ascending: false }).limit(4),
    ]);

    setTodayAtt(att.data);

    const monthRows = mAtt.data ?? [];
    let hours = 0, present = 0, late = 0, leave = 0;
    monthRows.forEach((r: any) => {
      if (r.check_in && r.check_out) {
        hours += workedHours(format(new Date(r.check_in), "HH:mm"), format(new Date(r.check_out), "HH:mm"));
      }
      if (r.status === "present") present++;
      else if (r.status === "late") late++;
      else if (r.status === "on_leave" || r.status === "leave") leave++;
    });
    setMonthStats({ present, late, leave, hours: Math.round(hours * 10) / 10, workdays: monthRows.length });

    const balances = bal.data ?? [];
    const totalAlloc = balances.reduce((s: number, b: any) => s + Number(b.allocated || 0), 0);
    const totalUsed = balances.reduce((s: number, b: any) => s + Number(b.used || 0), 0);
    setLeaveBal({ allocated: totalAlloc, used: totalUsed });

    const taskList = tks.data ?? [];
    setTasks(taskList);
    const overdue = taskList.filter((t: any) => t.due_date && t.due_date < today).length;
    const inProg = taskList.filter((t: any) => t.status === "in_progress").length;
    const pend = taskList.filter((t: any) => t.status === "pending").length;
    setTaskCounts({ pending: pend, inProgress: inProg, overdue });

    const merged = [
      ...(hol.data ?? []).map((h: any) => ({ id: `h-${h.id}`, title: h.name, date: h.holiday_date, kind: "holiday" as const })),
      ...(evts.data ?? []).map((e: any) => ({ id: `e-${e.id}`, title: e.title, date: e.event_date, kind: "event" as const, location: e.location })),
    ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    setUpcoming(merged);

    setRecentLeaves(lvs.data ?? []);
  }

  async function checkIn() {
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    const status = computeAttendanceStatus({
      scheduled: me.scheduled_check_in?.slice(0, 5) ?? "09:00",
      checkIn: format(now, "HH:mm"),
    }) as any;
    const { error } = await supabase.from("attendance").insert({
      employee_id: me.id, date: today, check_in: now.toISOString(), status,
    });
    if (error) return toast({ title: "Check-in failed", description: error.message, variant: "destructive" });
    toast({ title: `Checked in at ${format(now, "HH:mm")}`, description: status === "late" ? "Marked late." : "On time." });
    load();
  }

  async function checkOut() {
    if (!todayAtt?.id) return;
    const { error } = await supabase.from("attendance").update({ check_out: new Date().toISOString() }).eq("id", todayAtt.id);
    if (error) return toast({ title: "Check-out failed", description: error.message, variant: "destructive" });
    toast({ title: "Checked out" });
    load();
  }

  const leaveRemaining = Math.max(0, leaveBal.allocated - leaveBal.used);
  const todayHours = todayAtt?.check_in && todayAtt?.check_out
    ? Math.round(workedHours(format(new Date(todayAtt.check_in), "HH:mm"), format(new Date(todayAtt.check_out), "HH:mm")) * 10) / 10
    : 0;

  return (
    <AppLayout>
      <PageHeader
        eyebrow={`Hello${me?.full_name ? `, ${me.full_name.split(" ")[0]}` : ""}`}
        title="Welcome back"
        description={format(new Date(), "EEEE, MMMM d, yyyy")}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Today's status" value={todayAtt?.status ? prettyStatus(todayAtt.status) : "Not in"} icon={UserCheck} accent={!!todayAtt?.check_in} isText />
        <StatCard label="Hours this month" value={`${monthStats.hours}h`} icon={Timer} isText />
        <StatCard label="Leave remaining" value={leaveRemaining} icon={CalendarDays} />
        <StatCard label="Open tasks" value={tasks.length} icon={CheckSquare} highlight={taskCounts.overdue > 0} />
      </div>

      {/* Today's attendance + Tasks */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="surface-card overflow-hidden">
          <SectionHeader title="Today's attendance" subtitle={`Schedule ${me?.scheduled_check_in?.slice(0,5) ?? "09:00"}`} icon={Clock} />
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Check-in</span>
              <span className="font-mono-tabular font-medium">{todayAtt?.check_in ? format(new Date(todayAtt.check_in), "HH:mm") : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Check-out</span>
              <span className="font-mono-tabular font-medium">{todayAtt?.check_out ? format(new Date(todayAtt.check_out), "HH:mm") : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Worked</span>
              <span className="font-mono-tabular font-medium">{todayHours}h <span className="text-muted-foreground">/ 9h</span></span>
            </div>
            <div className="pt-2">
              {!todayAtt?.check_in ? (
                <Button onClick={checkIn} className="w-full"><LogIn className="h-4 w-4 mr-2" />Check in now</Button>
              ) : !todayAtt?.check_out ? (
                <Button onClick={checkOut} variant="outline" className="w-full"><LogOutIcon className="h-4 w-4 mr-2" />Check out</Button>
              ) : (
                <div className="text-center text-sm text-muted-foreground">Day complete ✓</div>
              )}
            </div>
          </div>
        </div>

        <div className="surface-card overflow-hidden lg:col-span-2">
          <SectionHeader title="My open tasks" subtitle={`${taskCounts.overdue} overdue · ${taskCounts.inProgress} in progress`} icon={CheckSquare} href="/tasks" />
          {tasks.length === 0 ? (
            <EmptyState text="No open tasks. Nice work!" />
          ) : (
            <ul className="divide-y divide-border">
              {tasks.map((t: any) => {
                const overdue = t.due_date && t.due_date < format(new Date(), "yyyy-MM-dd");
                return (
                  <li key={t.id} className="px-6 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${t.priority === "high" ? "bg-destructive" : t.priority === "medium" ? "bg-accent" : "bg-muted-foreground/50"}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <div className="text-xs text-muted-foreground capitalize">{t.status.replace("_", " ")}{t.due_date ? ` · due ${format(new Date(t.due_date), "MMM d")}` : ""}</div>
                      </div>
                    </div>
                    {overdue && <span className="text-xs text-destructive shrink-0">Overdue</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Month summary + Upcoming + Recent leaves */}
      <div className="grid lg:grid-cols-3 gap-4 mb-10">
        <div className="surface-card overflow-hidden">
          <SectionHeader title="This month" subtitle={format(new Date(), "MMMM yyyy")} icon={CalendarCheck} />
          <div className="p-6 space-y-4">
            <AttendanceRow label="Present" value={monthStats.present} total={Math.max(monthStats.workdays, 1)} tone="success" />
            <AttendanceRow label="Late" value={monthStats.late} total={Math.max(monthStats.workdays, 1)} tone="accent" />
            <AttendanceRow label="On leave" value={monthStats.leave} total={Math.max(monthStats.workdays, 1)} tone="muted" />
          </div>
        </div>

        <div className="surface-card overflow-hidden">
          <SectionHeader title="Upcoming" subtitle="Next 14 days" icon={CalendarDays} href="/calendar" />
          {upcoming.length === 0 ? (
            <EmptyState text="Nothing on the calendar." />
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((u: any) => {
                const d = new Date(u.date);
                const diff = differenceInCalendarDays(d, new Date());
                const rel = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : `In ${diff}d`;
                return (
                  <li key={u.id} className="px-6 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-8 w-8 rounded-md flex items-center justify-center text-xs font-medium ${u.kind === "holiday" ? "bg-success/10 text-success" : "bg-accent-soft text-accent"}`}>
                        {format(d, "dd")}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{u.title}</div>
                        <div className="text-xs text-muted-foreground">{u.kind === "holiday" ? "Holiday" : "Event"}</div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{rel}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="surface-card overflow-hidden">
          <SectionHeader title="My leave requests" subtitle="Recent activity" icon={CalendarX} href="/leave" />
          {recentLeaves.length === 0 ? (
            <EmptyState text="No leave requests yet." />
          ) : (
            <ul className="divide-y divide-border">
              {recentLeaves.map((l: any) => (
                <li key={l.id} className="px-6 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{l.leave_type?.name ?? "Leave"}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(l.start_date), "MMM d")} → {format(new Date(l.end_date), "MMM d")} · {l.days}d</div>
                  </div>
                  <LeavePill status={l.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function prettyStatus(s: string) {
  if (s === "present") return "Present";
  if (s === "late") return "Late";
  if (s === "half_day") return "Half day";
  if (s === "on_leave" || s === "leave") return "On leave";
  if (s === "absent") return "Absent";
  return s;
}

function LeavePill({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-success/10 text-success border-success/20",
    pending: "bg-accent-soft text-accent border-accent/20",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
    cancelled: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize shrink-0 ${map[status] ?? map.pending}`}>
      {status}
    </span>
  );
}

/* ============================== Shared UI ============================== */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent, highlight, isText }: { label: string; value: number | string; icon: any; accent?: boolean; highlight?: boolean; isText?: boolean }) {
  return (
    <div className={`stat-card ${highlight ? "ring-1 ring-accent/40" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className={`h-8 w-8 rounded-md flex items-center justify-center ${accent ? "bg-accent text-accent-foreground" : highlight ? "bg-accent-soft text-accent" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={`font-display mt-4 font-mono-tabular ${isText ? "text-2xl" : "text-4xl"}`}>{value}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle, href, icon: Icon }: { title: string; subtitle?: string; href?: string; icon?: any }) {
  return (
    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="h-8 w-8 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-lg truncate">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {href && (
        <a href={href} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0">
          View all <ArrowUpRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-10 text-center text-sm text-muted-foreground">{text}</div>;
}

function AttendanceRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: "success" | "accent" | "muted" }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const barClass = tone === "success" ? "bg-success" : tone === "accent" ? "bg-accent" : "bg-muted-foreground/40";
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono-tabular font-medium">{value}<span className="text-muted-foreground"> / {total}</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${barClass} transition-all`} style={{ width: `${pct}%` }} />
      </div>
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
