import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Search, Mail, Phone } from "lucide-react";
import { StatusPill } from "@/pages/Dashboard";

interface Employee {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  status: string;
  joining_date: string | null;
  employment_type: string | null;
  department_id: string | null;
  department?: { name: string } | null;
}

interface Department { id: string; name: string }

export default function Employees() {
  const [list, setList] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  useEffect(() => { document.title = "Employees · Digi Captain CRM"; load(); }, []);

  async function load() {
    const [{ data: emps }, { data: depts }] = await Promise.all([
      supabase.from("employees").select("*, department:departments(name)").order("full_name"),
      supabase.from("departments").select("id, name").order("name"),
    ]);
    setList((emps as Employee[]) ?? []);
    setDepartments(depts ?? []);
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
                className="px-4 sm:px-6 py-4 flex items-center justify-between gap-4 hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => { setEditing(e); setOpen(true); }}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-accent-soft text-accent flex items-center justify-center text-sm font-medium shrink-0">
                    {e.full_name?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-3 mt-0.5">
                      <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{e.email}</span>
                      {e.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{e.phone}</span>}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end text-xs text-muted-foreground gap-1">
                  <span>{e.designation || "—"}</span>
                  <span>{e.department?.name || "Unassigned"}</span>
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

function EmployeeDialog({
  departments, employee, onSaved,
}: { departments: Department[]; employee: Employee | null; onSaved: () => void }) {
  const isEdit = !!employee;
  const [form, setForm] = useState({
    full_name: "", email: "", password: "", role: "employee" as "employee" | "hr",
    phone: "", designation: "",
    department_id: "", employment_type: "full_time",
    joining_date: "", status: "active",
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
      });
    } else {
      setForm({ full_name: "", email: "", password: "", role: "employee", phone: "", designation: "", department_id: "", employment_type: "full_time", joining_date: "", status: "active" });
    }
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
        const payload: any = {
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone || null,
          designation: form.designation || null,
          department_id: form.department_id || null,
          employment_type: form.employment_type,
          joining_date: form.joining_date || null,
          status: form.status,
        };
        const { error } = await supabase.from("employees").update(payload).eq("id", employee!.id);
        if (error) throw error;
        toast.success("Employee updated");
        onSaved();
      } else {
        // Create a real auth user + employee row via edge function
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
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);

        // Apply the extra fields the edge function doesn't set
        if ((data as any)?.user_id) {
          await supabase
            .from("employees")
            .update({
              employment_type: form.employment_type as any,
              joining_date: form.joining_date || null,
              status: form.status as any,
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
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">
          {employee ? "Edit employee" : "Add employee"}
        </DialogTitle>
      </DialogHeader>
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
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "employee" | "hr" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                </SelectContent>
              </Select>
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
      <DialogFooter>
        <Button onClick={save} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
          {saving ? "Saving…" : employee ? "Save changes" : "Add employee"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
