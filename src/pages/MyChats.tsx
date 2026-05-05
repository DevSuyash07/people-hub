import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProjectChat } from "@/components/ProjectChat";
import { MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Project = { id: string; website_name: string; status: string };
type LastMsg = { project_id: string; body: string; created_at: string };

export default function MyChats() {
  const { user, role } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [lastMsgs, setLastMsgs] = useState<Record<string, LastMsg>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [active, setActive] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "My Chats · Digi Captain CRM";
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function load() {
    setLoading(true);
    const { data: me } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user!.id)
      .maybeSingle();

    let projQuery = supabase.from("projects").select("id, website_name, status");
    if (role !== "admin" && me?.id) {
      const { data: mems } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("employee_id", me.id);
      const ids = (mems ?? []).map((m: any) => m.project_id);
      if (ids.length === 0) {
        setProjects([]);
        setLoading(false);
        return;
      }
      projQuery = projQuery.in("id", ids);
    }

    const { data: prs } = await projQuery.order("website_name");
    setProjects((prs ?? []) as Project[]);
    const projectIds = (prs ?? []).map((p: any) => p.id);

    const [{ data: msgs }, { data: reads }] = await Promise.all([
      supabase
        .from("project_messages")
        .select("project_id, body, created_at, sender_id")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("project_chat_reads")
        .select("project_id, last_read_at")
        .eq("user_id", user!.id)
        .in("project_id", projectIds),
    ]);

    const lastMap: Record<string, LastMsg> = {};
    (msgs ?? []).forEach((m: any) => {
      if (!lastMap[m.project_id]) lastMap[m.project_id] = m;
    });
    setLastMsgs(lastMap);

    const readMap: Record<string, string> = {};
    (reads ?? []).forEach((r: any) => { readMap[r.project_id] = r.last_read_at; });
    const unreadMap: Record<string, number> = {};
    (msgs ?? []).forEach((m: any) => {
      if (m.sender_id === me?.id) return;
      const lr = readMap[m.project_id];
      if (!lr || new Date(m.created_at) > new Date(lr)) {
        unreadMap[m.project_id] = (unreadMap[m.project_id] ?? 0) + 1;
      }
    });
    setUnread(unreadMap);
    setLoading(false);
  }

  return (
    <AppLayout>
      <PageHeader
        title="My Chats"
        description="Chat with the team on every project you're part of."
      />
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : projects.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          You're not on any project chats yet.
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {projects.map((p) => {
            const last = lastMsgs[p.id];
            return (
              <button
                key={p.id}
                onClick={() => setActive(p)}
                className="text-left bg-card hover:bg-accent transition-colors border rounded-lg p-4 flex items-center gap-4"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium truncate">{p.website_name}</div>
                    {p.status === "hold" && (
                      <span className="text-[10px] uppercase tracking-wide text-destructive">on hold</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {last ? last.body : "No messages yet"}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {last && (
                    <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(last.created_at), { addSuffix: true })}
                    </div>
                  )}
                  {unread[p.id] > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                      {unread[p.id]}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(v) => { if (!v) { setActive(null); load(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{active?.website_name} · Chat</DialogTitle>
          </DialogHeader>
          {active && <ProjectChat projectId={active.id} projectName={active.website_name} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
