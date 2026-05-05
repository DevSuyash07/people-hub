import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  employee_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id, _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const { employee_id } = (await req.json()) as Payload;
    if (!employee_id) return json({ error: "employee_id required" }, 400);

    // Look up the target
    const { data: emp, error: empErr } = await admin
      .from("employees")
      .select("id, user_id, email")
      .eq("id", employee_id)
      .maybeSingle();
    if (empErr) return json({ error: empErr.message }, 500);
    if (!emp) return json({ error: "Employee not found" }, 404);

    // Refuse to delete self or another admin
    if (emp.user_id === userData.user.id) {
      return json({ error: "You cannot delete your own account" }, 400);
    }
    if (emp.user_id) {
      const { data: targetIsAdmin } = await admin.rpc("has_role", {
        _user_id: emp.user_id, _role: "admin",
      });
      if (targetIsAdmin) return json({ error: "Cannot delete an admin account" }, 400);
    }

    // Hard delete: remove all dependent rows first, then the employee, then the auth user.
    if (emp.user_id) {
      await admin.from("user_roles").delete().eq("user_id", emp.user_id);
    }
    await admin.from("project_members").delete().eq("employee_id", employee_id);
    await admin.from("project_messages").delete().eq("sender_id", employee_id);
    await admin.from("task_comments").delete().eq("author_id", employee_id);
    await admin.from("task_attachments").delete().eq("uploaded_by", employee_id);
    await admin.from("tasks").delete().or(`assigned_to.eq.${employee_id},assigned_by.eq.${employee_id}`);
    await admin.from("attendance").delete().eq("employee_id", employee_id);
    await admin.from("leave_requests").delete().eq("employee_id", employee_id);
    await admin.from("leave_balances").delete().eq("employee_id", employee_id);
    // Detach reports from this lead so the FK-style validation trigger doesn't block.
    await admin.from("employees").update({ team_lead_id: null }).eq("team_lead_id", employee_id);

    const { error: empDelErr } = await admin.from("employees").delete().eq("id", employee_id);
    if (empDelErr) return json({ error: `Employee deletion failed: ${empDelErr.message}` }, 400);

    if (emp.user_id) {
      const { error: delErr } = await admin.auth.admin.deleteUser(emp.user_id);
      if (delErr) return json({ error: `Auth deletion failed: ${delErr.message}` }, 400);
    }

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
