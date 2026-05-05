import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { X, Megaphone } from "lucide-react";

type Notif = {
  id: string;
  type: "hold" | "new" | "reactivated";
  message: string;
  created_at: string;
  expires_at: string;
};

const typeStyle: Record<Notif["type"], string> = {
  hold: "bg-destructive text-destructive-foreground",
  new: "bg-primary text-primary-foreground",
  reactivated: "bg-emerald-600 text-white",
};

export function ProjectMarquee() {
  const { user, role } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);

  // HR is excluded from the projects feature per spec
  const enabled = !!user && role !== "hr";

  useEffect(() => {
    if (!enabled) return;
    load();
    const channel = supabase
      .channel("project-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_notifications" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id]);

  async function load() {
    if (!user) return;
    const nowIso = new Date().toISOString();
    const [{ data: notifs }, { data: dismissed }] = await Promise.all([
      supabase
        .from("project_notifications")
        .select("id, type, message, created_at, expires_at")
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("project_notification_dismissals")
        .select("notification_id")
        .eq("user_id", user.id),
    ]);
    const dismissedIds = new Set((dismissed ?? []).map((d) => d.notification_id));
    setItems(((notifs ?? []) as Notif[]).filter((n) => !dismissedIds.has(n.id)));
  }

  async function dismiss(id: string) {
    if (!user) return;
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase
      .from("project_notification_dismissals")
      .insert({ notification_id: id, user_id: user.id });
  }

  if (!enabled || items.length === 0) return null;

  // Only show the single latest notification.
  const n = items[0];
  return (
    <div className="sticky top-0 z-40 flex flex-col">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium border-b border-black/10 ${typeStyle[n.type]}`}
      >
        <Megaphone className="h-3.5 w-3.5 shrink-0" />
        <div className="flex-1 overflow-hidden">
          <div className="whitespace-nowrap animate-[marquee_25s_linear_infinite]">
            {n.message}
          </div>
        </div>
        <button
          aria-label="Dismiss"
          onClick={() => dismiss(n.id)}
          className="shrink-0 rounded-sm p-0.5 hover:bg-black/20 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
