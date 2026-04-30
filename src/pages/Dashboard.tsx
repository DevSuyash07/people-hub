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

/* ============================== Shared UI ============================== */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent, highlight }: { label: string; value: number; icon: any; accent?: boolean; highlight?: boolean }) {
  return (
    <div className={`stat-card ${highlight ? "ring-1 ring-accent/40" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className={`h-8 w-8 rounded-md flex items-center justify-center ${accent ? "bg-accent text-accent-foreground" : highlight ? "bg-accent-soft text-accent" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="font-display text-4xl mt-4 font-mono-tabular">{value}</div>
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
