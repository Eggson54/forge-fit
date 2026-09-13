// Supabase Edge Function: permanently delete a user's account + all data.
// Deploy: `supabase functions deploy delete-account`
// It uses the service-role key (server-side only) to remove the auth user;
// every data table cascades on `auth.users` delete, so rows are removed too.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return json({ error: 'Missing token' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify the caller and get their id from the JWT (never trust the body).
    const authed = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authed.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(url, serviceKey);
    // Remove storage objects under the user's folder, then delete the user.
    await admin.storage.from('progress-photos').remove([`${userData.user.id}/`]).catch(() => {});
    const { error } = await admin.auth.admin.deleteUser(userData.user.id);
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
