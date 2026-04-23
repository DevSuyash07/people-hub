import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Clock, LogIn, LogOut as LogOutIcon } from "lucide-react";
import { format } from "date-fns";

interface AttendanceRow {
  id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  notes: string | null;
  employee?: { full_name: string; email: string };
}

export default function Attendance() {
  const { user, role } = useAuth();
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [history, setHistory] = useState<AttendanceRow[]>([]);
  const [allToday, setAllToday] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const isManager = role === "admin" || role === "hr";
  const todayStr = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  useEffect(() => {
    document.title = "Attendance · Atrium HR";
    if (user) load();
  }, [user, role]);

  async function load() {
    setLoading(true);
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user!.id)
      .maybeSingle();
    setMe(emp);

    if (emp) {
      const { data: t } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", emp.id)
        .eq("date", todayStr)
        .maybeSingle();
      setToday(t as AttendanceRow | null);

      const { data: h } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", emp.id)
        .order("date", { ascending: false })
        .limit(30);
      setHistory((h ?? []) as AttendanceRow[]);
    }

    if (isManager) {
      const { data: all } = await supabase
        .from("attendance")
        .select("*, employee:employees(full_name, email)")
        .eq("date", todayStr)
        .order("check_in", { ascending: false });
      setAllToday((all ?? []) as AttendanceRow[]);
    }
    setLoading(false);
  }

  async function checkIn() {
    if (!me) return;
    const now = new Date();
    const hour = now.getHours();
    const status = hour >= 10 ? "late" : "present";
    const { error } = await supabase.from("attendance").insert({
      employee_id: me.id,
      date: todayStr,
      check_in: now.toISOString(),
      status: status as any,
    });
    if (error) toast({ title: "Check-in failed", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Checked in", description: format(now, "p") });
      load();
    }
  }

  async function checkOut() {
    if (!today) return;
    const { error } = await supabase
      .from("attendance")
      .update({ check_out: new Date().toISOString() })
      .eq("id", today.id);
    if (error) toast({ title: "Check-out failed", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Checked out" });
      load();
    }
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Attendance"
        title="Track your day"
        description="Check in when you start, check out when you're done."
      />

      {/* Today card */}
      <div className="surface-card p-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Today</div>
            <div className="font-display text-3xl mt-2">{format(new Date(), "EEEE, d MMM yyyy")}</div>
            <div className="mt-3 flex items-center gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">In:</span>{" "}
                <span className="font-medium">{today?.check_in ? format(new Date(today.check_in), "p") : "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Out:</span>{" "}
                <span className="font-medium">{today?.check_out ? format(new Date(today.check_out), "p") : "—"}</span>
              </div>
              {today && <StatusBadge status={today.status} />}
            </div>
          </div>
          <div className="flex gap-3">
            {!today?.check_in && (
              <Button onClick={checkIn} disabled={loading}>
                <LogIn className="h-4 w-4" /> Check in
              </Button>
            )}
            {today?.check_in && !today?.check_out && (
              <Button onClick={checkOut} variant="secondary">
                <LogOutIcon className="h-4 w-4" /> Check out
              </Button>
            )}
            {today?.check_in && today?.check_out && (
              <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
                <Clock className="h-4 w-4" /> Day complete
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manager view: today's team */}
      {isManager && (
        <div className="surface-card overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg">Team — Today</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{allToday.length} record(s)</p>
          </div>
          {allToday.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No check-ins yet today.</div>
          ) : (
            <ul className="divide-y divide-border">
              {allToday.map((r) => (
                <li key={r.id} className="px-6 py-3 flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.employee?.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.employee?.email}</div>
                  </div>
                  <div className="flex items-center gap-6 text-xs text-muted-foreground">
                    <span>In {r.check_in ? format(new Date(r.check_in), "p") : "—"}</span>
                    <span>Out {r.check_out ? format(new Date(r.check_out), "p") : "—"}</span>
                    <StatusBadge status={r.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* My history */}
      <div className="surface-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg">My recent attendance</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Last 30 records</p>
        </div>
        {history.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No history yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((r) => (
              <li key={r.id} className="px-6 py-3 flex items-center justify-between text-sm">
                <div className="font-medium">{format(new Date(r.date), "EEE, d MMM")}</div>
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <span>In {r.check_in ? format(new Date(r.check_in), "p") : "—"}</span>
                  <span>Out {r.check_out ? format(new Date(r.check_out), "p") : "—"}</span>
                  <StatusBadge status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    present: "bg-success/10 text-success border-success/20",
    late: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    absent: "bg-destructive/10 text-destructive border-destructive/20",
    half_day: "bg-muted text-muted-foreground border-border",
    on_leave: "bg-accent-soft text-accent border-accent/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${map[status] ?? map.present}`}>
      {status.replace("_", " ")}
    </span>
  );
}
