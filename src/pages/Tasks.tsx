import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Clock,
  Paperclip,
  Plus,
  Send,
  Trash2,
  Download,
} from "lucide-react";
import { format } from "date-fns";

type Priority = "low" | "medium" | "high";
type Status = "pending" | "in_progress" | "completed";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: Status;
  due_date: string | null;
  assigned_to: string;
  assigned_by: string | null;
  completed_at: string | null;
  created_at: string;
}

interface EmployeeRef {
  id: string;
  full_name: string;
  user_id: string | null;
}

const priorityStyle: Record<Priority, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  low: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
};

const statusLabel: Record<Status, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

export default function Tasks() {
  const { user, role } = useAuth();
  const isManager = role === "admin" || role === "hr";

  const [meEmpId, setMeEmpId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<EmployeeRef[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [scope, setScope] = useState<"mine" | "all">("mine");

  const [createOpen, setCreateOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // form state
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium" as Priority,
    due_date: "",
    assigned_to: "",
  });

  useEffect(() => {
    if (!user) return;
    void bootstrap();
  }, [user, scope]);

  async function bootstrap() {
    setLoading(true);
    // Get my employee row
    const { data: me } = await supabase
      .from("employees")
      .select("id, full_name, user_id")
      .eq("user_id", user!.id)
      .maybeSingle();
    setMeEmpId(me?.id ?? null);

    // Employees list (managers can assign to anyone)
    if (isManager) {
      const { data: emps } = await supabase
        .from("employees")
        .select("id, full_name, user_id")
        .eq("status", "active")
        .order("full_name");
      setEmployees(emps ?? []);
    } else if (me) {
      setEmployees([me]);
    }

    // Tasks
    let q = supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (scope === "mine" && me) {
      q = q.eq("assigned_to", me.id);
    }
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setTasks((data ?? []) as Task[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (filter === "all") return tasks;
    return tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

  const counts = useMemo(() => {
    return {
      pending: tasks.filter((t) => t.status === "pending").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      completed: tasks.filter((t) => t.status === "completed").length,
    };
  }, [tasks]);

  async function handleCreate() {
    if (!form.title.trim()) return toast.error("Title required");
    if (!meEmpId) return toast.error("Profile not loaded");
    const assigned_to = form.assigned_to || meEmpId;

    const { error } = await supabase.from("tasks").insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assigned_to,
      assigned_by: meEmpId,
    });
    if (error) return toast.error(error.message);
    toast.success("Task created");
    setCreateOpen(false);
    setForm({ title: "", description: "", priority: "medium", due_date: "", assigned_to: "" });
    void bootstrap();
  }

  async function toggleStatus(t: Task, next: Status) {
    const { error } = await supabase
      .from("tasks")
      .update({
        status: next,
        completed_at: next === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", t.id);
    if (error) return toast.error(error.message);
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
  }

  async function deleteTask(t: Task) {
    if (!confirm("Delete this task permanently?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    setDetailTask(null);
    toast.success("Task deleted");
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Productivity"
        title="My Tasks"
        description="Stay on top of everything assigned to you and the work you delegate."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Task
          </Button>
        }
      />

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Pending" value={counts.pending} tone="amber" />
        <StatCard label="In Progress" value={counts.in_progress} tone="blue" />
        <StatCard label="Completed" value={counts.completed} tone="emerald" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>

        {isManager && (
          <Tabs value={scope} onValueChange={(v) => setScope(v as any)}>
            <TabsList>
              <TabsTrigger value="mine">Assigned to me</TabsTrigger>
              <TabsTrigger value="all">All tasks</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {loading ? (
        <Card className="p-10 text-center text-muted-foreground">Loading…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          No tasks here yet.
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const assignee = employees.find((e) => e.id === t.assigned_to);
            return (
              <Card
                key={t.id}
                className="p-4 flex items-start gap-3 hover:border-primary/40 transition-colors cursor-pointer"
                onClick={() => setDetailTask(t)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStatus(
                      t,
                      t.status === "completed" ? "pending" : "completed",
                    );
                  }}
                  className="mt-0.5"
                  aria-label="Toggle complete"
                >
                  {t.status === "completed" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-medium ${t.status === "completed" ? "line-through text-muted-foreground" : ""}`}
                    >
                      {t.title}
                    </span>
                    <Badge variant="outline" className={priorityStyle[t.priority]}>
                      {t.priority}
                    </Badge>
                    {t.status === "in_progress" && (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/20">
                        In Progress
                      </Badge>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                      {t.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                    {t.due_date && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Due {format(new Date(t.due_date), "MMM d")}
                      </span>
                    )}
                    {scope === "all" && assignee && (
                      <span>👤 {assignee.full_name}</span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={200}
                placeholder="Fix login issue on dashboard"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={2000}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v as Priority })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>
            {isManager && (
              <div>
                <Label>Assign to</Label>
                <Select
                  value={form.assigned_to || meEmpId || ""}
                  onValueChange={(v) => setForm({ ...form, assigned_to: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name}{e.id === meEmpId ? " (me)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      {detailTask && (
        <TaskDetailDialog
          task={detailTask}
          meEmpId={meEmpId}
          employees={employees}
          isManager={isManager}
          onClose={() => setDetailTask(null)}
          onStatusChange={(next) => toggleStatus(detailTask, next)}
          onDelete={() => deleteTask(detailTask)}
        />
      )}
    </AppLayout>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "emerald";
}) {
  const toneMap = {
    amber: "bg-amber-500/10 text-amber-700",
    blue: "bg-blue-500/10 text-blue-700",
    emerald: "bg-emerald-500/10 text-emerald-700",
  };
  return (
    <Card className="p-4">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-md ${toneMap[tone]}`}>
        <Circle className="h-4 w-4" />
      </div>
      <div className="mt-3 text-2xl font-display">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
    </Card>
  );
}

interface DetailProps {
  task: Task;
  meEmpId: string | null;
  employees: EmployeeRef[];
  isManager: boolean;
  onClose: () => void;
  onStatusChange: (s: Status) => void;
  onDelete: () => void;
}

function TaskDetailDialog({
  task,
  meEmpId,
  employees,
  isManager,
  onClose,
  onStatusChange,
  onDelete,
}: DetailProps) {
  const [comments, setComments] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void load();
  }, [task.id]);

  async function load() {
    const [c, a] = await Promise.all([
      supabase
        .from("task_comments")
        .select("id, body, created_at, author_id")
        .eq("task_id", task.id)
        .order("created_at"),
      supabase
        .from("task_attachments")
        .select("*")
        .eq("task_id", task.id)
        .order("created_at"),
    ]);
    setComments(c.data ?? []);
    setAttachments(a.data ?? []);
  }

  async function postComment() {
    if (!newComment.trim() || !meEmpId) return;
    const { error } = await supabase.from("task_comments").insert({
      task_id: task.id,
      author_id: meEmpId,
      body: newComment.trim().slice(0, 2000),
    });
    if (error) return toast.error(error.message);
    setNewComment("");
    void load();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !meEmpId) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Max 10 MB");
    setUploading(true);
    const path = `${task.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("task-attachments")
      .upload(path, file);
    if (upErr) {
      setUploading(false);
      return toast.error(upErr.message);
    }
    const { error: insErr } = await supabase.from("task_attachments").insert({
      task_id: task.id,
      uploaded_by: meEmpId,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
    });
    setUploading(false);
    e.target.value = "";
    if (insErr) return toast.error(insErr.message);
    void load();
  }

  async function downloadFile(att: any) {
    const { data, error } = await supabase.storage
      .from("task-attachments")
      .createSignedUrl(att.file_path, 60);
    if (error || !data) return toast.error("Download failed");
    window.open(data.signedUrl, "_blank");
  }

  const assignee = employees.find((e) => e.id === task.assigned_to);
  const canManage = isManager || task.assigned_to === meEmpId;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {task.title}
            <Badge variant="outline" className={priorityStyle[task.priority]}>
              {task.priority}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {task.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {task.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">
              Status
            </div>
            {canManage ? (
              <Select value={task.status} onValueChange={(v) => onStatusChange(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span>{statusLabel[task.status]}</span>
            )}
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">
              Assignee
            </div>
            <div>{assignee?.full_name ?? "—"}</div>
          </div>
          {task.due_date && (
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">
                Due date
              </div>
              <div>{format(new Date(task.due_date), "PP")}</div>
            </div>
          )}
        </div>

        {/* Attachments */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase text-muted-foreground tracking-wider">
              Attachments
            </div>
            <label className="text-xs text-primary cursor-pointer flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              {uploading ? "Uploading…" : "Attach file"}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
          {attachments.length === 0 ? (
            <div className="text-xs text-muted-foreground">No files attached.</div>
          ) : (
            <div className="space-y-1">
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                  <span className="truncate">{a.file_name}</span>
                  <Button variant="ghost" size="sm" onClick={() => downloadFile(a)}>
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        <div>
          <div className="text-xs uppercase text-muted-foreground tracking-wider mb-2">
            Comments
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
            {comments.length === 0 ? (
              <div className="text-xs text-muted-foreground">No comments yet.</div>
            ) : (
              comments.map((c) => {
                const author = employees.find((e) => e.id === c.author_id);
                return (
                  <div key={c.id} className="text-sm border rounded-md p-2">
                    <div className="text-xs text-muted-foreground mb-0.5">
                      {author?.full_name ?? "User"} · {format(new Date(c.created_at), "PP p")}
                    </div>
                    <div className="whitespace-pre-wrap">{c.body}</div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add a comment…"
              value={newComment}
              maxLength={2000}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && postComment()}
            />
            <Button onClick={postComment} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          {isManager ? (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          ) : <div />}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
