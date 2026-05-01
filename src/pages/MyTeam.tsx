import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Navigate } from "react-router-dom";
import { Users, ClipboardList, Crown } from "lucide-react";
import { format } from "date-fns";

interface Member {
  id: string;
  full_name: string;
  email: string;
  designation: string | null;
  status: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to: string;
}

export default function MyTeam() {
  const { user, role, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isLead, setIsLead] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasksByMember, setTasksByMember] = useState<Record<string, TaskRow[]>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Get current employee record
      const { data: me } = await supabase
        .from("employees")
        .select("id, is_team_lead")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!me?.is_team_lead) {
        setIsLead(false);
        setLoading(false);
        return;
      }
      setIsLead(true);

      const { data: team } = await supabase
        .from("employees")
        .select("id, full_name, email, designation, status")
        .eq("team_lead_id", me.id)
        .order("full_name");

      const teamList = (team || []) as Member[];
      setMembers(teamList);

      if (teamList.length) {
        const ids = teamList.map((m) => m.id);
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, status, priority, due_date, assigned_to")
          .in("assigned_to", ids)
          .order("created_at", { ascending: false });

        const grouped: Record<string, TaskRow[]> = {};
        (tasks || []).forEach((t: any) => {
          (grouped[t.assigned_to] ||= []).push(t);
        });
        setTasksByMember(grouped);
      }
      setLoading(false);
    })();
  }, [user]);

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="text-sm text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  if (!isLead && role !== "admin" && role !== "hr") {
    return <Navigate to="/dashboard" replace />;
  }

  const initials = (n: string) =>
    n.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const statusVariant = (s: string) =>
    s === "completed" ? "secondary" : s === "in_progress" ? "default" : "outline";

  return (
    <AppLayout>
      <PageHeader
        title="My Team"
        description="Your direct reports and the projects assigned to them"
      />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <div className="text-2xl font-semibold">{members.length}</div>
              <div className="text-xs text-muted-foreground">Team members</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <ClipboardList className="h-8 w-8 text-primary" />
            <div>
              <div className="text-2xl font-semibold">
                {Object.values(tasksByMember).flat().length}
              </div>
              <div className="text-xs text-muted-foreground">Total assigned tasks</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Crown className="h-8 w-8 text-primary" />
            <div>
              <div className="text-2xl font-semibold">
                {Object.values(tasksByMember)
                  .flat()
                  .filter((t) => t.status !== "completed").length}
              </div>
              <div className="text-xs text-muted-foreground">Open tasks</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {members.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No employees are reporting to you yet. Ask an admin to assign team members.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {members.map((m) => {
            const tasks = tasksByMember[m.id] || [];
            return (
              <Card key={m.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{initials(m.full_name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{m.full_name}</CardTitle>
                        <div className="text-xs text-muted-foreground">
                          {m.designation || "—"} · {m.email}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline">{tasks.length} tasks</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {tasks.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No tasks assigned.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-md border bg-card/50"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">
                              {t.title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t.due_date
                                ? `Due ${format(new Date(t.due_date), "MMM d, yyyy")}`
                                : "No due date"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className="capitalize">
                              {t.priority}
                            </Badge>
                            <Badge
                              variant={statusVariant(t.status) as any}
                              className="capitalize"
                            >
                              {t.status.replace("_", " ")}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
