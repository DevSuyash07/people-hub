import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Building2, Trash2 } from "lucide-react";

interface Dept { id: string; name: string; description: string | null; count?: number }

export default function Departments() {
  const [list, setList] = useState<Dept[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => { document.title = "Departments · Atrium HR"; load(); }, []);

  async function load() {
    const { data: depts } = await supabase.from("departments").select("*").order("name");
    const { data: emps } = await supabase.from("employees").select("department_id");
    const counts = new Map<string, number>();
    (emps ?? []).forEach((e: any) => {
      if (e.department_id) counts.set(e.department_id, (counts.get(e.department_id) ?? 0) + 1);
    });
    setList((depts ?? []).map((d: any) => ({ ...d, count: counts.get(d.id) ?? 0 })));
  }

  async function create() {
    if (!name.trim()) return;
    const { error } = await supabase.from("departments").insert({ name: name.trim(), description: description || null });
    if (error) return toast.error(error.message);
    toast.success("Department created");
    setName(""); setDescription(""); setOpen(false); load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this department? Employees will become unassigned.")) return;
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Structure"
        title="Departments"
        description="Group your team by function."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Plus className="h-4 w-4 mr-2" /> New department
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display text-2xl">New department</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Product" />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={create} className="bg-accent hover:bg-accent/90 text-accent-foreground">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {list.length === 0 ? (
        <div className="surface-card p-16 text-center">
          <div className="font-display text-2xl mb-2">No departments</div>
          <p className="text-sm text-muted-foreground">Create your first department.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((d) => (
            <div key={d.id} className="surface-card p-6 group hover:-translate-y-0.5 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="h-10 w-10 rounded-md bg-accent-soft text-accent flex items-center justify-center">
                  <Building2 className="h-5 w-5" />
                </div>
                <button
                  onClick={() => remove(d.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="font-display text-2xl mb-1">{d.name}</div>
              <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
                {d.description || "No description"}
              </p>
              <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
                <span className="font-mono-tabular text-foreground font-medium">{d.count}</span> members
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
