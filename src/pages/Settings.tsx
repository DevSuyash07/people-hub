import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Trash2, UserPlus, Crown, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface UserWithRole {
  user_id: string;
  email: string;
  full_name: string;
  roles: string[];
}

interface Department { id: string; name: string }

export default function Settings() {
  const [list, setList] = useState<UserWithRole[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "hr" | "employee">("hr");

  // Create-user form (admin only)
  const [cuOpen, setCuOpen] = useState(false);
  const [cuName, setCuName] = useState("");
  const [cuEmail, setCuEmail] = useState("");
  const [cuPassword, setCuPassword] = useState("");
  const [cuRole, setCuRole] = useState<"hr" | "employee">("hr");
  const [cuPhone, setCuPhone] = useState("");
  const [cuDesignation, setCuDesignation] = useState("");
  const [cuDept, setCuDept] = useState<string>("");
  const [cuSaving, setCuSaving] = useState(false);

  useEffect(() => { document.title = "Settings · Digi Captain CRM"; load(); }, []);

  async function load() {
    const [{ data: emps }, { data: roles }, { data: depts }] = await Promise.all([
      supabase.from("employees").select("user_id, email, full_name").not("user_id", "is", null),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("departments").select("id, name").order("name"),
    ]);
    setDepartments((depts ?? []) as Department[]);
    const byUser = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    });
    setList(
      (emps ?? []).map((e: any) => ({
        user_id: e.user_id,
        email: e.email,
        full_name: e.full_name,
        roles: byUser.get(e.user_id) ?? [],
      })),
    );
  }

  async function createUser() {
    if (!cuName.trim() || !cuEmail.trim() || cuPassword.length < 8) {
      return toast.error("Name, email and password (8+ chars) are required");
    }
    setCuSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        full_name: cuName.trim(),
        email: cuEmail.trim().toLowerCase(),
        password: cuPassword,
        role: cuRole,
        phone: cuPhone || undefined,
        designation: cuDesignation || undefined,
        department_id: cuDept || undefined,
      },
    });
    setCuSaving(false);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error ?? error?.message ?? "Failed to create user");
    }
    toast.success(`${cuRole === "hr" ? "HR" : "Employee"} account created`);
    setCuName(""); setCuEmail(""); setCuPassword(""); setCuPhone(""); setCuDesignation(""); setCuDept("");
    setCuOpen(false);
    load();
  }

  async function assign() {
    const target = list.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!target) return toast.error("No user found with that email. They must sign up first.");
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: target.user_id, role: role as "admin" | "hr" | "employee" });
    if (error && !error.message.includes("duplicate")) return toast.error(error.message);
    toast.success(`Granted ${role} to ${target.email}`);
    setEmail("");
    load();
  }

  async function revoke(userId: string, r: string) {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", r as "admin" | "hr" | "employee");
    if (error) return toast.error(error.message);
    toast.success("Role removed");
    load();
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Administrator"
        title="Users & access"
        description="Create new HR or Employee accounts and manage role assignments."
        actions={
          <Button onClick={() => setCuOpen((v) => !v)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <UserPlus className="h-4 w-4 mr-2" /> {cuOpen ? "Close" : "Create user"}
          </Button>
        }
      />

      {cuOpen && (
        <div className="surface-card p-6 mb-8">
          <h3 className="text-xl mb-1">Create new account</h3>
          <p className="text-xs text-muted-foreground mb-5">
            The user can sign in immediately with the email and password you set below.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Full name *</Label>
              <Input value={cuName} onChange={(e) => setCuName(e.target.value)} placeholder="Jane Doe" maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={cuEmail} onChange={(e) => setCuEmail(e.target.value)} placeholder="jane@company.com" maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label>Password * <span className="text-muted-foreground font-normal">(8+ chars)</span></Label>
              <Input type="password" value={cuPassword} onChange={(e) => setCuPassword(e.target.value)} placeholder="••••••••" minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={cuRole} onValueChange={(v: any) => setCuRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hr">HR — manage people</SelectItem>
                  <SelectItem value="employee">Employee — own data</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={cuPhone} onChange={(e) => setCuPhone(e.target.value)} placeholder="+91…" maxLength={20} />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input value={cuDesignation} onChange={(e) => setCuDesignation(e.target.value)} placeholder="HR Manager" maxLength={100} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Department</Label>
              <Select value={cuDept} onValueChange={setCuDept}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <Button onClick={createUser} disabled={cuSaving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {cuSaving ? "Creating…" : `Create ${cuRole === "hr" ? "HR" : "Employee"} account`}
            </Button>
            <Button variant="ghost" onClick={() => setCuOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="surface-card p-6 lg:col-span-1 h-fit">
          <h3 className="text-xl mb-4">Grant role</h3>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>User email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v: any) => setRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — full access</SelectItem>
                  <SelectItem value="hr">HR — manage people</SelectItem>
                  <SelectItem value="employee">Employee — own data</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={assign} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
              <Shield className="h-4 w-4 mr-2" /> Grant role
            </Button>
            <p className="text-xs text-muted-foreground">
              Tip: ask the person to sign up first at the login page, then grant their role here.
            </p>
          </div>
        </div>

        <div className="surface-card overflow-hidden lg:col-span-2">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-xl">All users</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{list.length} accounts</p>
          </div>
          <ul className="divide-y divide-border">
            {list.map((u) => (
              <li key={u.user_id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{u.full_name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {u.roles.length === 0 ? (
                    <span className="text-xs text-muted-foreground">no roles</span>
                  ) : (
                    u.roles.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1 text-xs rounded-full border border-border bg-muted px-2 py-0.5 capitalize"
                      >
                        {r}
                        <button
                          onClick={() => revoke(u.user_id, r)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${r} role`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <TeamStructureCard />
    </AppLayout>
  );
}

interface TeamEmployee {
  id: string;
  full_name: string;
  designation: string | null;
  status: string;
  is_team_lead: boolean;
  team_lead_id: string | null;
  department?: { name: string } | null;
}

function TeamStructureCard() {
  const [emps, setEmps] = useState<TeamEmployee[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<string>("");
  const [assignLead, setAssignLead] = useState<string>("");

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, designation, status, is_team_lead, team_lead_id, department:departments(name)")
      .eq("status", "active")
      .order("full_name");
    setEmps((data as TeamEmployee[]) ?? []);
  }

  async function toggleLead(emp: TeamEmployee, next: boolean) {
    setBusyId(emp.id);
    // When demoting, also clear any reports pointing to this person to avoid trigger errors elsewhere
    if (!next) {
      await supabase.from("employees").update({ team_lead_id: null }).eq("team_lead_id", emp.id);
    }
    const patch: any = { is_team_lead: next };
    if (next) patch.team_lead_id = null; // a lead cannot also report to a lead
    const { error } = await supabase.from("employees").update(patch).eq("id", emp.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(next ? `${emp.full_name} is now a Team Lead` : `${emp.full_name} is no longer a Team Lead`);
    load();
  }

  async function assignToLead() {
    if (!assignFor || !assignLead) return toast.error("Pick an employee and a team lead");
    const { error } = await supabase
      .from("employees")
      .update({ team_lead_id: assignLead })
      .eq("id", assignFor);
    if (error) return toast.error(error.message);
    toast.success("Assigned");
    setAssignFor(""); setAssignLead("");
    load();
  }

  async function unassign(empId: string) {
    const { error } = await supabase.from("employees").update({ team_lead_id: null }).eq("id", empId);
    if (error) return toast.error(error.message);
    load();
  }

  const leads = emps.filter((e) => e.is_team_lead);
  const assignableMembers = emps.filter((e) => !e.is_team_lead && e.id !== assignLead);

  return (
    <div className="surface-card overflow-hidden mt-8">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-xl flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /> Team structure</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Promote employees to Team Lead and assign reports.</p>
        </div>
      </div>

      {/* Quick assign */}
      <div className="px-6 py-4 border-b border-border grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end bg-muted/30">
        <div className="space-y-1.5">
          <Label className="text-xs">Employee</Label>
          <Select value={assignFor} onValueChange={setAssignFor}>
            <SelectTrigger><SelectValue placeholder="Select employee…" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {assignableMembers.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.full_name}{e.designation ? ` · ${e.designation}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Assign to team lead</Label>
          <Select value={assignLead} onValueChange={setAssignLead}>
            <SelectTrigger><SelectValue placeholder="Select team lead…" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {leads.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.full_name}{l.department?.name ? ` · ${l.department.name}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={assignToLead} className="bg-accent hover:bg-accent/90 text-accent-foreground">Assign</Button>
      </div>

      {/* Leads & their reports */}
      <div className="divide-y divide-border">
        {leads.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No team leads yet. Toggle <Crown className="inline h-3 w-3" /> beside an employee below to promote them.
          </div>
        )}
        {leads.map((lead) => {
          const reports = emps.filter((e) => e.team_lead_id === lead.id);
          return (
            <div key={lead.id} className="px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Crown className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{lead.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {lead.designation || "—"} · {lead.department?.name || "Unassigned"} · {reports.length} report{reports.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Team Lead</span>
                  <Switch
                    checked
                    disabled={busyId === lead.id}
                    onCheckedChange={() => toggleLead(lead, false)}
                  />
                </div>
              </div>
              {reports.length > 0 && (
                <ul className="mt-3 ml-12 space-y-1">
                  {reports.map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        {r.full_name}
                        <span className="text-xs text-muted-foreground">{r.designation ? `· ${r.designation}` : ""}</span>
                      </span>
                      <button
                        onClick={() => unassign(r.id)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* All employees toggle list */}
      <div className="border-t border-border">
        <div className="px-6 py-3 text-xs uppercase tracking-wide text-muted-foreground bg-muted/30">
          All active employees
        </div>
        <ul className="divide-y divide-border max-h-96 overflow-y-auto">
          {emps.map((e) => (
            <li key={e.id} className="px-6 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{e.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {e.designation || "—"} · {e.department?.name || "Unassigned"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Lead</span>
                <Switch
                  checked={e.is_team_lead}
                  disabled={busyId === e.id}
                  onCheckedChange={(v) => toggleLead(e, v)}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
