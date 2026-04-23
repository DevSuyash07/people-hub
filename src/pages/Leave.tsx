import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Plus, Check, X } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";

interface LeaveType { id: string; name: string; default_days: number; is_paid: boolean }
interface LeaveRequest {
  id: string; employee_id: string; leave_type_id: string;
  start_date: string; end_date: string; days: number;
  reason: string | null; status: string; review_notes: string | null;
  created_at: string;
  leave_type?: { name: string };
  employee?: { full_name: string; email: string };
}
interface Balance { id: string; leave_type_id: string; allocated: number; used: number; year: number; leave_type?: { name: string } }

export default function Leave() {
  const { user, role } = useAuth();
  const isManager = role === "admin" || role === "hr";
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => { document.title = "Leave · Atrium HR"; if (user) load(); }, [user, role]);

  async function load() {
    const { data: emp } = await supabase.from("employees").select("id").eq("user_id", user!.id).maybeSingle();
    setMe(emp);

    const { data: t } = await supabase.from("leave_types").select("*").order("name");
    setTypes((t ?? []) as LeaveType[]);

    if (emp) {
      const yr = new Date().getFullYear();
      const { data: b } = await supabase
        .from("leave_balances")
        .select("*, leave_type:leave_types(name)")
        .eq("employee_id", emp.id)
        .eq("year", yr);
      setBalances((b ?? []) as Balance[]);

      const { data: r } = await supabase
        .from("leave_requests")
        .select("*, leave_type:leave_types(name)")
        .eq("employee_id", emp.id)
        .order("created_at", { ascending: false });
      setMyRequests((r ?? []) as LeaveRequest[]);
    }

    if (isManager) {
      const { data: a } = await supabase
        .from("leave_requests")
        .select("*, leave_type:leave_types(name), employee:employees(full_name, email)")
        .order("created_at", { ascending: false });
      setAllRequests((a ?? []) as LeaveRequest[]);
    }
  }

  async function review(id: string, status: "approved" | "rejected", notes?: string) {
    const { error } = await supabase
      .from("leave_requests")
      .update({ status, review_notes: notes ?? null, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else { toast({ title: `Request ${status}` }); load(); }
  }

  async function cancel(id: string) {
    const { error } = await supabase.from("leave_requests").update({ status: "cancelled" }).eq("id", id);
    if (error) toast({ title: "Cancel failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Request cancelled" }); load(); }
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Leave"
        title="Time away"
        description="Request, track, and manage time off."
        actions={
          me && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4" /> Request leave</Button>
              </DialogTrigger>
              <RequestDialog
                types={types}
                employeeId={me.id}
                onClose={() => { setOpen(false); load(); }}
              />
            </Dialog>
          )
        }
      />

      {/* Balances */}
      {balances.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {balances.map((b) => {
            const remaining = Number(b.allocated) - Number(b.used);
            return (
              <div key={b.id} className="stat-card">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{b.leave_type?.name}</div>
                <div className="font-display text-4xl mt-3 font-mono-tabular">{remaining}</div>
                <div className="text-xs text-muted-foreground mt-1">{b.used} used / {b.allocated} allocated</div>
              </div>
            );
          })}
        </div>
      )}

      <Tabs defaultValue={isManager ? "all" : "mine"}>
        <TabsList>
          <TabsTrigger value="mine">My requests</TabsTrigger>
          {isManager && <TabsTrigger value="all">All requests</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine" className="mt-6">
          <RequestsList rows={myRequests} onCancel={cancel} canCancel />
        </TabsContent>

        {isManager && (
          <TabsContent value="all" className="mt-6">
            <RequestsList rows={allRequests} onReview={review} canReview showEmployee />
          </TabsContent>
        )}
      </Tabs>
    </AppLayout>
  );
}

function RequestDialog({ types, employeeId, onClose }: { types: LeaveType[]; employeeId: string; onClose: () => void }) {
  const [typeId, setTypeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => {
    if (!start || !end) return 0;
    const d = differenceInCalendarDays(new Date(end), new Date(start)) + 1;
    return d > 0 ? d : 0;
  }, [start, end]);

  async function submit() {
    if (!typeId || !start || !end || days < 1) {
      toast({ title: "Please complete all fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("leave_requests").insert({
      employee_id: employeeId,
      leave_type_id: typeId,
      start_date: start,
      end_date: end,
      days,
      reason: reason || null,
      status: "pending" as any,
    });
    setSaving(false);
    if (error) toast({ title: "Submit failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Request submitted" }); onClose(); }
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Request leave</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Leave type</Label>
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Start date</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>End date</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} min={start} />
          </div>
        </div>
        <div className="text-sm text-muted-foreground">Total: <span className="font-medium text-foreground">{days} day{days === 1 ? "" : "s"}</span></div>
        <div>
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional context for your manager" maxLength={500} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={saving}>Submit request</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function RequestsList({
  rows, onCancel, onReview, canCancel, canReview, showEmployee,
}: {
  rows: LeaveRequest[];
  onCancel?: (id: string) => void;
  onReview?: (id: string, status: "approved" | "rejected", notes?: string) => void;
  canCancel?: boolean;
  canReview?: boolean;
  showEmployee?: boolean;
}) {
  if (rows.length === 0) {
    return <div className="surface-card p-12 text-center text-sm text-muted-foreground">No requests.</div>;
  }
  return (
    <div className="surface-card overflow-hidden">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="px-6 py-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0">
                {showEmployee && (
                  <div className="text-sm font-medium">{r.employee?.full_name}</div>
                )}
                <div className="text-sm">
                  <span className="font-medium">{r.leave_type?.name}</span>{" "}
                  <span className="text-muted-foreground">·</span>{" "}
                  <span className="text-muted-foreground">
                    {format(new Date(r.start_date), "d MMM")} – {format(new Date(r.end_date), "d MMM yyyy")} · {r.days} day{r.days == 1 ? "" : "s"}
                  </span>
                </div>
                {r.reason && <div className="text-xs text-muted-foreground mt-1 max-w-xl">{r.reason}</div>}
                {r.review_notes && <div className="text-xs italic text-muted-foreground mt-1">Note: {r.review_notes}</div>}
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={r.status} />
                {canReview && r.status === "pending" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => onReview!(r.id, "approved")}><Check className="h-3.5 w-3.5" /> Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => onReview!(r.id, "rejected")}><X className="h-3.5 w-3.5" /> Reject</Button>
                  </>
                )}
                {canCancel && r.status === "pending" && (
                  <Button size="sm" variant="ghost" onClick={() => onCancel!(r.id)}>Cancel</Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    approved: "bg-success/10 text-success border-success/20",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
    cancelled: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs capitalize ${map[status] ?? map.pending}`}>
      {status}
    </span>
  );
}
