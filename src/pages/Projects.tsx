import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Globe, Mail, Phone, Calendar as CalIcon, Users2, MessageSquare } from "lucide-react";
import { ProjectChat } from "@/components/ProjectChat";
import { format } from "date-fns";
import { z } from "zod";

type Plan = "silver" | "gold" | "platinum" | "diamond" | "custom";
type Status = "active" | "hold";

type Project = {
  id: string;
  website_name: string;
  website_url: string | null;
  start_date: string | null;
  plan: Plan;
  email: string | null;
  phone: string | null;
  keywords_date: string | null;
  monthly_reporting_day: number | null;
  business_summary: string | null;
  additional_info: string | null;
  social_facebook: string | null;
  social_instagram: string | null;
  social_twitter: string | null;
  social_linkedin: string | null;
  social_youtube: string | null;
  social_other: string | null;
  status: Status;
  created_at: string;
};

type Employee = { id: string; full_name: string; email: string };

const projectSchema = z.object({
  website_name: z.string().trim().min(1, "Website name required").max(120),
  website_url: z.string().trim().max(255).url("Invalid URL").or(z.literal("")),
  email: z.string().trim().max(255).email("Invalid email").or(z.literal("")),
  phone: z.string().trim().max(40).or(z.literal("")),
  business_summary: z.string().trim().max(1000).or(z.literal("")),
  additional_info: z.string().trim().max(2000).or(z.literal("")),
  monthly_reporting_day: z.number().int().min(1).max(31).optional().nullable(),
});

const emptyForm = {
  website_name: "",
  website_url: "",
  start_date: "",
  plan: "silver" as Plan,
  email: "",
  phone: "",
  keywords_date: "",
  monthly_reporting_day: "" as string | number,
  business_summary: "",
  additional_info: "",
  social_facebook: "",
  social_instagram: "",
  social_twitter: "",
  social_linkedin: "",
  social_youtube: "",
  social_other: "",
  status: "active" as Status,
};

export default function Projects() {
  const { user, role } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [members, setMembers] = useState<Record<string, string[]>>({}); // projectId -> employeeIds
  const [isLead, setIsLead] = useState(false);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [memberSel, setMemberSel] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [loading, setLoading] = useState(true);
  const [chatProject, setChatProject] = useState<Project | null>(null);

  useEffect(() => {
    document.title = "Projects · Digi Captain CRM";
    if (user) checkLead();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function checkLead() {
    const { data } = await supabase
      .from("employees")
      .select("id, is_team_lead")
      .eq("user_id", user!.id)
      .maybeSingle();
    setIsLead(!!data?.is_team_lead);
    setMyEmployeeId(data?.id ?? null);
  }

  async function load() {
    setLoading(true);
    const [{ data: pr }, { data: emp }, { data: mem }] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("employees").select("id, full_name, email").eq("status", "active").order("full_name"),
      supabase.from("project_members").select("project_id, employee_id"),
    ]);
    setProjects((pr ?? []) as Project[]);
    setEmployees((emp ?? []) as Employee[]);
    const map: Record<string, string[]> = {};
    (mem ?? []).forEach((m: any) => {
      map[m.project_id] = map[m.project_id] || [];
      map[m.project_id].push(m.employee_id);
    });
    setMembers(map);
    setLoading(false);
  }

  const canManage = role === "admin" || isLead;

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setMemberSel([]);
    setOpen(true);
  }

  function openEdit(p: Project) {
    setEditing(p);
    setForm({
      website_name: p.website_name,
      website_url: p.website_url ?? "",
      start_date: p.start_date ?? "",
      plan: p.plan,
      email: p.email ?? "",
      phone: p.phone ?? "",
      keywords_date: p.keywords_date ?? "",
      monthly_reporting_day: p.monthly_reporting_day ?? "",
      business_summary: p.business_summary ?? "",
      additional_info: p.additional_info ?? "",
      social_facebook: p.social_facebook ?? "",
      social_instagram: p.social_instagram ?? "",
      social_twitter: p.social_twitter ?? "",
      social_linkedin: p.social_linkedin ?? "",
      social_youtube: p.social_youtube ?? "",
      social_other: p.social_other ?? "",
      status: p.status,
    });
    setMemberSel(members[p.id] ?? []);
    setOpen(true);
  }

  async function save() {
    const parsed = projectSchema.safeParse({
      website_name: form.website_name,
      website_url: form.website_url,
      email: form.email,
      phone: form.phone,
      business_summary: form.business_summary,
      additional_info: form.additional_info,
      monthly_reporting_day:
        form.monthly_reporting_day === "" ? null : Number(form.monthly_reporting_day),
    });
    if (!parsed.success) {
      toast({ title: "Check the form", description: parsed.error.errors[0].message, variant: "destructive" });
      return;
    }

    const payload: any = {
      website_name: form.website_name.trim(),
      website_url: form.website_url || null,
      start_date: form.start_date || null,
      plan: form.plan,
      email: form.email || null,
      phone: form.phone || null,
      keywords_date: form.keywords_date || null,
      monthly_reporting_day:
        form.monthly_reporting_day === "" ? null : Number(form.monthly_reporting_day),
      business_summary: form.business_summary || null,
      additional_info: form.additional_info || null,
      social_facebook: form.social_facebook || null,
      social_instagram: form.social_instagram || null,
      social_twitter: form.social_twitter || null,
      social_linkedin: form.social_linkedin || null,
      social_youtube: form.social_youtube || null,
      social_other: form.social_other || null,
      status: form.status,
    };

    let projectId = editing?.id;

    if (editing) {
      const { error } = await supabase.from("projects").update(payload).eq("id", editing.id);
      if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      payload.created_by = user?.id;
      const { data, error } = await supabase.from("projects").insert(payload).select("id").single();
      if (error) return toast({ title: "Create failed", description: error.message, variant: "destructive" });
      projectId = data.id;
    }

    // Sync members
    if (projectId) {
      const current = new Set(members[projectId] ?? []);
      const next = new Set(memberSel);
      const toAdd = [...next].filter((id) => !current.has(id));
      const toRemove = [...current].filter((id) => !next.has(id));
      if (toAdd.length) {
        await supabase.from("project_members").insert(
          toAdd.map((employee_id) => ({ project_id: projectId!, employee_id })),
        );
      }
      if (toRemove.length) {
        await supabase
          .from("project_members")
          .delete()
          .eq("project_id", projectId)
          .in("employee_id", toRemove);
      }
    }

    toast({ title: editing ? "Project updated" : "Project created" });
    setOpen(false);
    load();
  }

  async function toggleStatus(p: Project, next: Status) {
    if (!canManage) return;
    const { error } = await supabase.from("projects").update({ status: next }).eq("id", p.id);
    if (error) return toast({ title: "Status update failed", description: error.message, variant: "destructive" });
    toast({ title: `Marked ${next === "hold" ? "On hold" : "Active"}` });
    load();
  }

  async function remove(p: Project) {
    if (role !== "admin") return;
    if (!confirm(`Delete project "${p.website_name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", p.id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    toast({ title: "Project deleted" });
    load();
  }

  // Admin sees all projects; everyone else sees only projects they're a member of.
  const visible = useMemo(() => {
    if (role === "admin") return projects;
    if (!myEmployeeId) return [];
    return projects.filter((p) => (members[p.id] ?? []).includes(myEmployeeId));
  }, [projects, members, role, myEmployeeId]);

  const filtered = useMemo(
    () => (filter === "all" ? visible : visible.filter((p) => p.status === filter)),
    [visible, filter],
  );

  const stats = useMemo(
    () => ({
      total: visible.length,
      active: visible.filter((p) => p.status === "active").length,
      hold: visible.filter((p) => p.status === "hold").length,
    }),
    [visible],
  );

  const pageTitle = role === "admin" ? "Projects" : "My Projects";

  return (
    <AppLayout>
      <PageHeader
        title={pageTitle}
        description={
          role === "admin"
            ? "All client websites, plans, and assigned team members."
            : "Projects you're assigned to."
        }
        actions={
          canManage && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          )
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-semibold">{stats.total}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Active</div><div className="text-2xl font-semibold text-emerald-600">{stats.active}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">On hold</div><div className="text-2xl font-semibold text-destructive">{stats.hold}</div></CardContent></Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(["all", "active", "hold"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All projects</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No projects yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Website</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const team = (members[p.id] ?? [])
                    .map((id) => employees.find((e) => e.id === id)?.full_name)
                    .filter(Boolean);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.website_name}</div>
                        {p.website_url && (
                          <a
                            href={p.website_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                          >
                            <Globe className="h-3 w-3" />
                            {p.website_url}
                          </a>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">{p.plan}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.start_date ? format(new Date(p.start_date), "dd MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {team.length === 0 ? (
                          <span className="text-muted-foreground">Unassigned</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {team.length} · <span className="text-muted-foreground truncate max-w-[180px] inline-block align-bottom">{team.join(", ")}</span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={p.status === "active"}
                              onCheckedChange={(v) => toggleStatus(p, v ? "active" : "hold")}
                            />
                            <span className={`text-xs font-medium ${p.status === "active" ? "text-emerald-600" : "text-destructive"}`}>
                              {p.status === "active" ? "Active" : "On hold"}
                            </span>
                          </div>
                        ) : (
                          <Badge variant={p.status === "active" ? "default" : "destructive"}>
                            {p.status === "active" ? "Active" : "On hold"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setChatProject(p)} title="Open chat">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        {canManage && (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {role === "admin" && (
                          <Button variant="ghost" size="sm" onClick={() => remove(p)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit project" : "New project"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Website name *">
              <Input value={form.website_name} onChange={(e) => setForm({ ...form, website_name: e.target.value })} />
            </Field>
            <Field label="Website URL">
              <Input placeholder="https://…" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} />
            </Field>

            <Field label="Project start date">
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="Plan">
              <Select value={form.plan} onValueChange={(v: Plan) => setForm({ ...form, plan: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="silver">Silver</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="platinum">Platinum</SelectItem>
                  <SelectItem value="diamond">Diamond</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>

            <Field label="Keywords date">
              <Input type="date" value={form.keywords_date} onChange={(e) => setForm({ ...form, keywords_date: e.target.value })} />
            </Field>
            <Field label="Monthly reporting day (1–31)">
              <Input
                type="number"
                min={1}
                max={31}
                value={form.monthly_reporting_day}
                onChange={(e) => setForm({ ...form, monthly_reporting_day: e.target.value })}
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="Business summary">
                <Textarea rows={2} value={form.business_summary} onChange={(e) => setForm({ ...form, business_summary: e.target.value })} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Additional info">
                <Textarea rows={2} value={form.additional_info} onChange={(e) => setForm({ ...form, additional_info: e.target.value })} />
              </Field>
            </div>

            <div className="md:col-span-2 pt-2">
              <div className="text-sm font-medium mb-2">Social media</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input placeholder="Facebook URL" value={form.social_facebook} onChange={(e) => setForm({ ...form, social_facebook: e.target.value })} />
                <Input placeholder="Instagram URL" value={form.social_instagram} onChange={(e) => setForm({ ...form, social_instagram: e.target.value })} />
                <Input placeholder="Twitter / X URL" value={form.social_twitter} onChange={(e) => setForm({ ...form, social_twitter: e.target.value })} />
                <Input placeholder="LinkedIn URL" value={form.social_linkedin} onChange={(e) => setForm({ ...form, social_linkedin: e.target.value })} />
                <Input placeholder="YouTube URL" value={form.social_youtube} onChange={(e) => setForm({ ...form, social_youtube: e.target.value })} />
                <Input placeholder="Other" value={form.social_other} onChange={(e) => setForm({ ...form, social_other: e.target.value })} />
              </div>
            </div>

            <div className="md:col-span-2 pt-2">
              <div className="text-sm font-medium mb-2">Assign team members</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {employees.map((e) => {
                  const checked = memberSel.includes(e.id);
                  return (
                    <label key={e.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(ev) => {
                          if (ev.target.checked) setMemberSel([...memberSel, e.id]);
                          else setMemberSel(memberSel.filter((id) => id !== e.id));
                        }}
                      />
                      <span className="truncate">{e.full_name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-2 flex items-center gap-3 pt-2">
              <Switch checked={form.status === "active"} onCheckedChange={(v) => setForm({ ...form, status: v ? "active" : "hold" })} />
              <span className="text-sm">{form.status === "active" ? "Active" : "On hold"}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save changes" : "Create project"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
