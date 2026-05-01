import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Search, Mail, Phone, Trash2, Crown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { StatusPill } from "@/pages/Dashboard";
import { format } from "date-fns";
import {
  computeAttendanceStatus, workedHours, GRACE_MIN, FULL_DAY_HOURS, HALF_DAY_BELOW,
} from "@/lib/attendance";

interface Employee {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  status: string;
  joining_date: string | null;
  employment_type: string | null;
  department_id: string | null;
  scheduled_check_in: string | null;
  is_team_lead: boolean;
  team_lead_id: string | null;
  department?: { name: string } | null;
  team_lead?: { full_name: string } | null;
}

interface Department { id: string; name: string }

export default function Employees() {
  const { role } = useAuth();
  const [list, setList] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null);
  const isAdmin = role === "admin";

  useEffect(() => { document.title = "Employees · Digi Captain CRM"; load(); }, []);

  async function load() {
    const [{ data: emps }, { data: depts }] = await Promise.all([
      supabase.from("employees").select("*, department:departments(name), team_lead:team_lead_id(full_name)").order("full_name"),
      supabase.from("departments").select("id, name").order("name"),
    ]);
    setList((emps as Employee[]) ?? []);
    setDepartments(depts ?? []);
  }

  const teamLeads = list.filter((e) => e.is_team_lead && e.status === "active");

  async function deleteEmployee() {
    if (!confirmDelete) return;
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { employee_id: confirmDelete.id },
    });
    if (error) {
      let detail = error.message;
      try {
        const ctx: any = (error as any).context;
        if (ctx?.json) { const b = await ctx.json(); if (b?.error) detail = b.error; }
      } catch {}
      toast.error(detail);
    } else if ((data as any)?.error) {
      toast.error((data as any).error);
    } else {
      toast.success("Employee removed");
      setConfirmDelete(null);
      load();
    }
  }

  const filtered = list.filter((e) =>
    [e.full_name, e.email, e.designation, e.department?.name]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <AppLayout>
      <PageHeader
        eyebrow="People"
        title="Employees"
        description="Manage profiles, roles and employment details."
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Plus className="h-4 w-4 mr-2" /> Add employee
              </Button>
            </DialogTrigger>
            <EmployeeDialog
              departments={departments}
              employee={editing}
              isAdmin={isAdmin}
              teamLeads={teamLeads}
              onSaved={() => { setOpen(false); setEditing(null); load(); }}
            />
          </Dialog>
        }
      />

      <div className="surface-card overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center gap-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Search by name, email, role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <span className="text-xs text-muted-foreground font-mono-tabular">
            {filtered.length} / {list.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="font-display text-2xl mb-2">No people yet</div>
            <p className="text-sm text-muted-foreground">Add your first employee to get started.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((e) => (
              <li
                key={e.id}
                className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4 hover:bg-muted/40 transition-colors"
              >
                <div
                  className="flex items-center gap-4 min-w-0 flex-1 cursor-pointer"
                  onClick={() => { setEditing(e); setOpen(true); }}
                >
                  <div className="h-10 w-10 rounded-full bg-accent-soft text-accent flex items-center justify-center text-sm font-medium shrink-0">
                    {e.full_name?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {e.full_name}
                      {e.is_team_lead && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5">
                          <Crown className="h-2.5 w-2.5" /> Lead
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-3 mt-0.5">
                      <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{e.email}</span>
                      {e.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{e.phone}</span>}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end text-xs text-muted-foreground gap-1">
                  <span>{e.designation || "—"}</span>
                  <span>{e.department?.name || "Unassigned"}</span>
                  {e.team_lead?.full_name && (
                    <span className="text-[11px]">↳ {e.team_lead.full_name}</span>
                  )}
                </div>
                <StatusPill status={e.status} />
                {isAdmin && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(ev) => { ev.stopPropagation(); setConfirmDelete(e); }}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently remove {confirmDelete?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their login will be revoked and they'll be marked terminated. Attendance and leave history are preserved for reports. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteEmployee}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

function EmployeeDialog({
  departments, employee, isAdmin, teamLeads, onSaved,
}: { departments: Department[]; employee: Employee | null; isAdmin: boolean; teamLeads: Employee[]; onSaved: () => void }) {
  const isEdit = !!employee;
  const [tab, setTab] = useState("profile");
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", role: "employee" as "employee" | "hr",
    phone: "", designation: "",
    department_id: "", employment_type: "full_time",
    joining_date: "", status: "active",
    scheduled_check_in: "09:00",
    is_team_lead: false,
    team_lead_id: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (employee) {
      setForm({
        full_name: employee.full_name ?? "",
        email: employee.email ?? "",
        password: "",
        role: "employee",
        phone: employee.phone ?? "",
        designation: employee.designation ?? "",
        department_id: employee.department_id ?? "",
        employment_type: employee.employment_type ?? "full_time",
        joining_date: employee.joining_date ?? "",
        status: employee.status ?? "active",
        scheduled_check_in: (employee.scheduled_check_in ?? "09:00:00").slice(0, 5),
        is_team_lead: !!employee.is_team_lead,
        team_lead_id: employee.team_lead_id ?? "",
      });
    } else {
      setForm({ full_name: "", email: "", password: "", role: "employee", phone: "", designation: "", department_id: "", employment_type: "full_time", joining_date: "", status: "active", scheduled_check_in: "09:00", is_team_lead: false, team_lead_id: "" });
    }
    setTab("profile");
  }, [employee]);

  async function save() {
    if (!form.full_name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!isEdit && form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        // Order matters: clearing is_team_lead while reports still point to this person would orphan them.
        // Admin/HR are responsible for reassigning before un-marking; trigger only blocks self/invalid lead.
        const payload: any = {
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone || null,
          designation: form.designation || null,
          department_id: form.department_id || null,
          employment_type: form.employment_type,
          joining_date: form.joining_date || null,
          status: form.status,
          scheduled_check_in: `${form.scheduled_check_in}:00`,
          is_team_lead: form.is_team_lead,
          team_lead_id: form.team_lead_id || null,
        };
        const { error } = await supabase.from("employees").update(payload).eq("id", employee!.id);
        if (error) throw error;
        toast.success("Employee updated");
        onSaved();
      } else {
        const { data, error } = await supabase.functions.invoke("admin-create-user", {
          body: {
            full_name: form.full_name.trim(),
            email: form.email.trim().toLowerCase(),
            password: form.password,
            role: form.role,
            phone: form.phone || undefined,
            designation: form.designation || undefined,
            department_id: form.department_id || undefined,
          },
        });
        if (error) {
          let detail = error.message;
          try {
            const ctx: any = (error as any).context;
            if (ctx && typeof ctx.json === "function") {
              const body = await ctx.json();
              if (body?.error) detail = body.error;
            }
          } catch {}
          throw new Error(detail);
        }
        if ((data as any)?.error) throw new Error((data as any).error);

        if ((data as any)?.user_id) {
          await supabase
            .from("employees")
            .update({
              employment_type: form.employment_type as any,
              joining_date: form.joining_date || null,
              status: form.status as any,
              scheduled_check_in: `${form.scheduled_check_in}:00`,
            })
            .eq("user_id", (data as any).user_id);
        }

        toast.success(`${form.role === "hr" ? "HR user" : "Employee"} created — they can sign in now`);
        onSaved();
      }
    } catch (err: any) {
      toast.error(err.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">
          {employee ? "Edit employee" : "Add employee"}
        </DialogTitle>
      </DialogHeader>

      {isEdit ? (
        <Tabs value={tab} onValueChange={setTab} className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="mt-4">
            <ProfileFields form={form} setForm={setForm} departments={departments} isEdit={isEdit} isAdmin={isAdmin} teamLeads={teamLeads} currentEmployeeId={employee?.id} />
          </TabsContent>
          <TabsContent value="attendance" className="mt-4">
            <AttendanceEditor employee={employee!} scheduledTime={form.scheduled_check_in} />
          </TabsContent>
        </Tabs>
      ) : (
        <ProfileFields form={form} setForm={setForm} departments={departments} isEdit={isEdit} isAdmin={isAdmin} teamLeads={teamLeads} currentEmployeeId={undefined} />
      )}

      {(!isEdit || tab === "profile") && (
        <DialogFooter className="mt-4">
          <Button onClick={save} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            {saving ? "Saving…" : employee ? "Save changes" : "Add employee"}
          </Button>
        </DialogFooter>
      )}
    </DialogContent>
  );
}

function ProfileFields({
  form, setForm, departments, isEdit, isAdmin,
}: { form: any; setForm: any; departments: Department[]; isEdit: boolean; isAdmin: boolean }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4 py-2">
      <div className="sm:col-span-2 space-y-1.5">
        <Label>Full name</Label>
        <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input type="email" value={form.email} disabled={isEdit} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      {!isEdit && (
        <>
          <div className="space-y-1.5">
            <Label>Temporary password</Label>
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Min 8 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                {isAdmin && <SelectItem value="hr">HR</SelectItem>}
              </SelectContent>
            </Select>
            {!isAdmin && <p className="text-xs text-muted-foreground">Only admin can create HR users.</p>}
          </div>
        </>
      )}
      <div className="space-y-1.5">
        <Label>Phone</Label>
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Designation</Label>
        <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Senior Engineer" />
      </div>
      <div className="space-y-1.5">
        <Label>Department</Label>
        <Select value={form.department_id || "none"} onValueChange={(v) => setForm({ ...form, department_id: v === "none" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Employment type</Label>
        <Select value={form.employment_type} onValueChange={(v) => setForm({ ...form, employment_type: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="full_time">Full-time</SelectItem>
            <SelectItem value="part_time">Part-time</SelectItem>
            <SelectItem value="contract">Contract</SelectItem>
            <SelectItem value="intern">Intern</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Joining date</Label>
        <Input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Scheduled check-in</Label>
        <Input
          type="time"
          value={form.scheduled_check_in}
          onChange={(e) => setForm({ ...form, scheduled_check_in: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">±{GRACE_MIN}m grace · {FULL_DAY_HOURS}h workday</p>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

interface AttRow {
  id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
}

function AttendanceEditor({ employee, scheduledTime }: { employee: Employee; scheduledTime: string }) {
  const [rows, setRows] = useState<AttRow[]>([]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [employee.id]);

  async function load() {
    const { data } = await supabase
      .from("attendance")
      .select("id, date, check_in, check_out, status")
      .eq("employee_id", employee.id)
      .order("date", { ascending: false })
      .limit(15);
    setRows((data ?? []) as AttRow[]);
  }

  function toIso(d: string, t: string) {
    if (!t) return null;
    return new Date(`${d}T${t}:00`).toISOString();
  }

  async function save() {
    setSaving(true);
    try {
      const ci = toIso(date, checkIn);
      const co = toIso(date, checkOut);
      const status = computeAttendanceStatus({
        scheduled: scheduledTime, checkIn, checkOut,
      });

      // Upsert by (employee_id, date)
      const { data: existing } = await supabase
        .from("attendance")
        .select("id")
        .eq("employee_id", employee.id)
        .eq("date", date)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("attendance")
          .update({ check_in: ci, check_out: co, status: status as any })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("attendance")
          .insert({
            employee_id: employee.id,
            date,
            check_in: ci,
            check_out: co,
            status: status as any,
          });
        if (error) throw error;
      }
      toast.success("Attendance saved");
      setCheckIn(""); setCheckOut("");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border p-4 bg-muted/30">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
          Set / correct attendance
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Check-in</Label>
            <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Check-out</Label>
            <Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Scheduled <strong className="text-foreground">{scheduledTime}</strong> · grace ±{GRACE_MIN}m · target {FULL_DAY_HOURS}h
            {checkIn && checkOut && (
              <> · worked <strong className="text-foreground">{workedHours(checkIn, checkOut).toFixed(2)}h</strong></>
            )}
          </span>
          <Button size="sm" onClick={save} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Recent (last 15)
        </div>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center border border-border rounded-lg">
            No attendance records yet.
          </div>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg">
            {rows.map((r) => {
              const inT = r.check_in ? format(new Date(r.check_in), "HH:mm") : "";
              const outT = r.check_out ? format(new Date(r.check_out), "HH:mm") : "";
              const hrs = inT && outT ? workedHours(inT, outT) : 0;
              const short = hrs > 0 && hrs < FULL_DAY_HOURS;
              return (
                <li key={r.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <div className="font-medium">{format(new Date(r.date), "EEE, d MMM")}</div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-mono-tabular">{inT || "—"} → {outT || "—"}</span>
                    {hrs > 0 && (
                      <span className={`font-mono-tabular ${short ? "text-amber-600" : "text-success"}`}>
                        {hrs.toFixed(1)}h
                      </span>
                    )}
                    <span className="capitalize">{r.status.replace("_", " ")}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
