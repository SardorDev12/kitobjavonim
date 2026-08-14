/**
 * Privileged user-management actions for the admin panel — the operations
 * that cannot be done through a SECURITY DEFINER SQL function (see
 * supabase/migrations/0013_admin_panel.sql for the ones that can) because
 * they need Supabase's Auth Admin API, which only works with the
 * service_role key: creating a new account with a password, banning login
 * outright, and deleting an account.
 *
 * Every action is gated the same way: the caller's own session must belong
 * to a signed-in user whose profiles.is_admin is true, checked fresh on
 * every request. The service_role key itself never leaves this function —
 * the admin panel only ever holds its own session token.
 *
 * Setup is documented in admin/README.md.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/**
 * Origins allowed to call this function, comma separated — the admin
 * panel's own URL(s), e.g. `https://admin.kitobjavonim.uz`. Unlike
 * scan-cover (`Access-Control-Allow-Origin: *`), this function can create
 * accounts, lock people out, and delete accounts outright, so the response
 * is only ever handed to an origin on this list rather than to anyone.
 */
const ALLOWED_ORIGINS = (Deno.env.get('ADMIN_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * A leaked short password is the single most likely way this panel gets
 * compromised, so the floor is set well above what the consumer app asks
 * of ordinary users.
 */
const MIN_PASSWORD_LENGTH = 12;

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(request) });

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return json(request, { error: 'Supabase environment is not available' }, 500);
  }

  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return json(request, { error: 'Origin not allowed' }, 403);
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json(request, { error: 'Not signed in' }, 401);

  // Identifies the caller from their own token — never trust a user id the
  // client sends in the body for this.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: callerData, error: callerError } = await asCaller.auth.getUser();
  if (callerError || !callerData.user) return json(request, { error: 'Not signed in' }, 401);
  const callerId = callerData.user.id;

  // service_role — bypasses RLS on purpose, for the is_admin check itself
  // and for every privileged action below. Constructed once per request and
  // never returned to the client in any form.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', callerId)
    .single();
  if (profileError || !callerProfile?.is_admin) {
    // TEMPORARY — diagnosing an is_admin=true-in-the-database-but-still-
    // rejected report. Safe to expose: only ever shown to the caller about
    // their own request, no other user's data. Remove once resolved.
    return json(
      request,
      {
        error: 'Not authorized',
        debug: { callerId, profileError: profileError?.message ?? null, callerProfile: callerProfile ?? null },
      },
      403
    );
  }

  let body: { action?: string; [key: string]: unknown };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: 'Invalid request body' }, 400);
  }

  switch (body.action) {
    case 'create_admin':
      return await createAdmin(request, admin, callerId, body);
    case 'set_ban':
      return await setBan(request, admin, callerId, body);
    case 'delete_user':
      return await deleteUser(request, admin, callerId, body);
    default:
      return json(request, { error: 'Unknown action' }, 400);
  }
});

/**
 * Mirrors log_admin_action() (0014_admin_audit_log.sql) — this function's
 * three actions can't go through that SQL helper themselves since they use
 * the Auth Admin API, not a SQL statement, so the same row shape is written
 * directly here with the service-role client instead. Best-effort: the
 * privileged action above has already happened and Admin API calls aren't
 * transactional, so a failed audit write can't undo it and shouldn't turn a
 * successful action into an error response — it's logged to this function's
 * own Supabase logs instead.
 */
async function logAction(
  admin: ReturnType<typeof createClient>,
  adminId: string,
  action: string,
  targetId: string | null,
  details?: Record<string, unknown>
): Promise<void> {
  const { error } = await admin
    .from('admin_actions')
    .insert({ admin_id: adminId, action, target_id: targetId, details: details ?? null });
  if (error) console.error('[admin-users] failed to write audit log:', error.message);
}

// -----------------------------------------------------------------------------
// create_admin — a brand new account with a password, pre-confirmed and
// flagged is_admin. The profile row itself is created by the same
// on_auth_user_created trigger every sign-up goes through; this just sets
// is_admin afterward, since a client-writable is_admin column would defeat
// the whole point (0012_report_moderation.sql).
// -----------------------------------------------------------------------------

async function createAdmin(
  request: Request,
  admin: ReturnType<typeof createClient>,
  callerId: string,
  body: Record<string, unknown>
): Promise<Response> {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(request, { error: 'Enter a valid email address' }, 400);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return json(request, { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return json(request, { error: error?.message ?? 'Could not create the account' }, 400);
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({ is_admin: true, display_name: displayName || email.split('@')[0] })
    .eq('id', data.user.id);
  if (updateError) {
    // The auth account exists but isn't an admin yet — surfaced clearly
    // rather than silently, since the caller needs to know to retry
    // promoting this account (e.g. from the users list) rather than assume
    // create_admin fully succeeded.
    return json(
      request,
      { error: `Account created but could not be flagged as admin: ${updateError.message}` },
      500
    );
  }

  await logAction(admin, callerId, 'create_admin', data.user.id, { email });

  return json(request, { id: data.user.id, email });
}

// -----------------------------------------------------------------------------
// set_ban — blocks sign-in outright via Auth's own ban_duration, rather than
// an app-level flag that every other query would have to remember to check.
// -----------------------------------------------------------------------------

async function setBan(
  request: Request,
  admin: ReturnType<typeof createClient>,
  callerId: string,
  body: Record<string, unknown>
): Promise<Response> {
  const userId = typeof body.user_id === 'string' ? body.user_id : '';
  const banned = body.banned === true;
  if (!userId) return json(request, { error: 'user_id is required' }, 400);
  if (userId === callerId) return json(request, { error: 'You cannot ban your own account' }, 400);

  const guardError = await refuseIfTargetIsAdmin(admin, userId);
  if (guardError) return json(request, { error: guardError }, 400);

  // GoTrue has no literal "forever" — ~10 years reads as permanent for any
  // practical purpose without relying on an unbounded value.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? '87600h' : 'none',
  });
  if (error) return json(request, { error: error.message }, 400);

  await logAction(admin, callerId, banned ? 'ban_user' : 'unban_user', userId);

  return json(request, { ok: true });
}

// -----------------------------------------------------------------------------
// delete_user — the actual mechanism behind the app's "contact us to delete
// your account" path (src/lib/legalContent.ts). Cascades through every
// table via each one's `references auth.users (id) on delete cascade`.
// -----------------------------------------------------------------------------

async function deleteUser(
  request: Request,
  admin: ReturnType<typeof createClient>,
  callerId: string,
  body: Record<string, unknown>
): Promise<Response> {
  const userId = typeof body.user_id === 'string' ? body.user_id : '';
  if (!userId) return json(request, { error: 'user_id is required' }, 400);
  if (userId === callerId) return json(request, { error: 'You cannot delete your own account' }, 400);

  const guardError = await refuseIfTargetIsAdmin(admin, userId);
  if (guardError) return json(request, { error: guardError }, 400);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return json(request, { error: error.message }, 400);

  await logAction(admin, callerId, 'delete_user', userId);

  return json(request, { ok: true });
}

/**
 * Both destructive actions require demoting an admin target first, as a
 * separate, deliberate step — makes it much harder to ban or delete a
 * co-admin by accident, or for one admin account to take out another in a
 * single click.
 */
async function refuseIfTargetIsAdmin(
  admin: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data, error } = await admin.from('profiles').select('is_admin').eq('id', userId).single();
  if (error) return 'User not found';
  if (data.is_admin) return 'This account is an admin — remove admin access first';
  return null;
}
