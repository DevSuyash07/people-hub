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
import { Shield, Trash2, UserPlus } from "lucide-react";

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
        title="Roles & access"
        description="Grant Admin or HR powers to existing users. Everyone starts as an Employee."
      />

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
    </AppLayout>
  );
}
