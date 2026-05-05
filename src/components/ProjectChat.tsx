import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { format } from "date-fns";

type Msg = {
  id: string;
  project_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type EmpMap = Record<string, { name: string; avatar?: string | null }>;

export function ProjectChat({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [employees, setEmployees] = useState<EmpMap>({});
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const [{ data: me }, { data: emps }, { data: msgs }] = await Promise.all([
        supabase.from("employees").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("employees").select("id, full_name, avatar_url"),
        supabase
          .from("project_messages")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true })
          .limit(500),
      ]);
      if (cancelled) return;
      setMyEmployeeId(me?.id ?? null);
      const map: EmpMap = {};
      (emps ?? []).forEach((e: any) => {
        map[e.id] = { name: e.full_name, avatar: e.avatar_url };
      });
      setEmployees(map);
      setMessages((msgs ?? []) as Msg[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`project-chat-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_messages",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === (payload.new as Msg).id)
              ? prev
              : [...prev, payload.new as Msg],
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || !myEmployeeId) return;
    setText("");
    const { error } = await supabase
      .from("project_messages")
      .insert({ project_id: projectId, sender_id: myEmployeeId, body });
    if (error) {
      setText(body);
    }
  }

  return (
    <div className="flex flex-col h-[60vh] min-h-[400px]">
      <div className="px-1 pb-2 text-xs text-muted-foreground border-b">
        Project chat · {projectName}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 space-y-2">
        {loading ? (
          <div className="text-sm text-muted-foreground text-center py-8">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No messages yet. Say hello 👋
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === myEmployeeId;
            const sender = employees[m.sender_id]?.name ?? "Unknown";
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {!mine && (
                    <div className="text-[10px] font-medium opacity-80 mb-0.5">
                      {sender}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className="text-[10px] opacity-60 mt-1 text-right">
                    {format(new Date(m.created_at), "dd MMM, HH:mm")}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t">
        <Input
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button onClick={send} disabled={!text.trim() || !myEmployeeId}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
