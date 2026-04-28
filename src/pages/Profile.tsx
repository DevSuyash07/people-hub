import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Profile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "", phone: "", date_of_birth: "", address: "",
    emergency_contact_name: "", emergency_contact_phone: "",
  });
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [changingPw, setChangingPw] = useState(false);

  async function changePassword() {
    if (pw.next.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw.next !== pw.confirm) return toast.error("Passwords do not match");
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setChangingPw(false);
    if (error) return toast.error(error.message);
    setPw({ next: "", confirm: "" });
    toast.success("Password updated");
  }

  useEffect(() => { document.title = "My Profile · Digi Captain CRM"; load(); }, [user]);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("employees").select("*").eq("user_id", user.id).maybeSingle();
    if (data) {
      setForm({
        full_name: data.full_name ?? "",
        phone: data.phone ?? "",
        date_of_birth: data.date_of_birth ?? "",
        address: data.address ?? "",
        emergency_contact_name: data.emergency_contact_name ?? "",
        emergency_contact_phone: data.emergency_contact_phone ?? "",
      });
    }
    setLoading(false);
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("employees")
      .update({
        full_name: form.full_name,
        phone: form.phone || null,
        date_of_birth: form.date_of_birth || null,
        address: form.address || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
      })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  }

  return (
    <AppLayout>
      <PageHeader
        eyebrow="Account"
        title="My profile"
        description="Keep your personal details and emergency contacts up to date."
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="surface-card p-6 sm:p-8 max-w-2xl">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Full name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Date of birth</Label>
              <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Emergency contact name</Label>
              <Input value={form.emergency_contact_name} onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Emergency contact phone</Label>
              <Input value={form.emergency_contact_phone} onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end mt-8">
            <Button onClick={save} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        <div className="surface-card p-6 sm:p-8 max-w-2xl mt-6">
          <div className="mb-5">
            <h3 className="text-lg font-semibold">Change password</h3>
            <p className="text-sm text-muted-foreground">Use at least 8 characters.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm new password</Label>
              <Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end mt-8">
            <Button onClick={changePassword} disabled={changingPw || !pw.next || !pw.confirm} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {changingPw ? "Updating…" : "Update password"}
            </Button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
