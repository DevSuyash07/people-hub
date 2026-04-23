import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export default function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = mode === "signin" ? "Sign in · Atrium HR" : "Create account · Atrium HR";
  }, [mode]);

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created. Signing you in…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: form */}
      <div className="flex flex-col px-6 sm:px-12 py-10">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-xl">Atrium</span>
        </div>

        <div className="flex-1 flex items-center">
          <div className="w-full max-w-sm mx-auto">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
              {mode === "signin" ? "Welcome back" : "Get started"}
            </div>
            <h1 className="font-display text-4xl mb-2">
              {mode === "signin" ? "Sign in to your workspace" : "Create your account"}
            </h1>
            <p className="text-muted-foreground text-sm mb-8">
              {mode === "signin"
                ? "Manage people, attendance and time off — all in one quiet place."
                : "New employees get an account here. Admin and HR roles are assigned by an admin."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder="Jane Doe"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@company.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={submitting}
              >
                {submitting
                  ? "Please wait…"
                  : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
              </Button>
            </form>

            <div className="mt-6 text-sm text-muted-foreground">
              {mode === "signin" ? (
                <>
                  No account yet?{" "}
                  <button
                    onClick={() => setMode("signup")}
                    className="text-foreground underline underline-offset-4 hover:text-accent"
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    onClick={() => setMode("signin")}
                    className="text-foreground underline underline-offset-4 hover:text-accent"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Atrium HR
        </div>
      </div>

      {/* Right: editorial panel */}
      <div className="hidden lg:flex bg-primary text-primary-foreground p-12 flex-col justify-between relative overflow-hidden">
        <div className="text-xs uppercase tracking-[0.25em] opacity-70">
          Atrium · A quiet HR system
        </div>

        <div className="relative z-10">
          <div className="font-display text-6xl leading-[1.05] mb-6">
            People work
            <br />
            <span className="italic opacity-90">deserves quiet</span>
            <br />
            tools.
          </div>
          <p className="opacity-70 max-w-md">
            One workspace for employees, HR and admins — built for small teams who
            value clarity over noise.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6 text-sm relative z-10">
          {[
            { k: "01", v: "Onboarding" },
            { k: "02", v: "Attendance" },
            { k: "03", v: "Time off" },
          ].map((f) => (
            <div key={f.k} className="border-t border-primary-foreground/20 pt-3">
              <div className="font-display text-2xl opacity-50">{f.k}</div>
              <div className="mt-1">{f.v}</div>
            </div>
          ))}
        </div>

        {/* decorative */}
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute -left-10 bottom-10 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      </div>
    </div>
  );
}
