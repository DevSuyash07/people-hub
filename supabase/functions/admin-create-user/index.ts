import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  full_name: string;
  email: string;
  password: string;
  role: "hr" | "employee";
  phone?: string;
  designation?: string;
  department_id?: string;
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

    // Verify caller and check admin role
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr) return json({ error: roleErr.message }, 500);
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const body = (await req.json()) as Payload;
    if (!body.email || !body.password || !body.full_name || !body.role) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (body.password.length < 8) return json({ error: "Password must be 8+ chars" }, 400);
    if (!["hr", "employee"].includes(body.role)) return json({ error: "Invalid role" }, 400);

    // Create the auth user (auto-confirmed so they can sign in immediately)
    let { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name },
    });

    // If the email is already registered, try to recover by deleting the
    // orphaned auth user (only if they are NOT an admin) and recreating.
    if (createErr && /already.*registered|already exists|duplicate/i.test(createErr.message)) {
      // Find the existing user by email
      let existingId: string | null = null;
      let page = 1;
      while (page < 20 && !existingId) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (listErr) break;
        const match = list.users.find((u) => (u.email ?? "").toLowerCase() === body.email.toLowerCase());
        if (match) existingId = match.id;
        if (!list.users.length || list.users.length < 200) break;
        page++;
      }

      if (!existingId) return json({ error: createErr.message }, 400);

      // Refuse to overwrite an admin account
      const { data: isExistingAdmin } = await admin.rpc("has_role", {
        _user_id: existingId,
        _role: "admin",
      });
      if (isExistingAdmin) {
        return json({ error: "This email belongs to an admin account and cannot be replaced." }, 400);
      }

      // Clean up dependent rows then delete the orphan auth user
      await admin.from("user_roles").delete().eq("user_id", existingId);
      await admin.from("employees").delete().eq("user_id", existingId);
      const { error: delErr } = await admin.auth.admin.deleteUser(existingId);
      if (delErr) return json({ error: `Could not replace existing user: ${delErr.message}` }, 400);

      // Retry creation
      const retry = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name },
      });
      created = retry.data;
      createErr = retry.error;
    }

    if (createErr || !created?.user) return json({ error: createErr?.message ?? "Create failed" }, 400);

    const newUserId = created.user.id;

    // handle_new_user trigger inserts an employee row + 'employee' role.
    // Update employee with extra details.
    await admin
      .from("employees")
      .update({
        full_name: body.full_name,
        phone: body.phone ?? null,
        designation: body.designation ?? null,
        department_id: body.department_id ?? null,
      })
      .eq("user_id", newUserId);

    // Add HR role on top of default employee role if needed
    if (body.role === "hr") {
      await admin.from("user_roles").insert({ user_id: newUserId, role: "hr" });
    }

    return json({ success: true, user_id: newUserId });
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
