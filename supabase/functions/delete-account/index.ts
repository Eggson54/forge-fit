// Supabase Edge Function: permanently delete a user's account and all data.
// Deploy: `supabase functions deploy delete-account`
//
// Order matters, and so does stopping. Everything that lives *outside* the
// database — progress photos in storage, the wearables account on the Open
// Wearables deployment — is removed first, and the account itself last. If
// any of it fails, the function stops with the account intact, so deleting
// again finishes the job. The alternative, deleting the account and hoping,
// leaves data that nobody can reach any more, including the person it
// belongs to; that is not a deletion.
//
// Database rows cascade on `auth.users` delete, wearable_links included.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore -- plain JavaScript shared with the Node tests (tests/purge.test.mjs).
import { purgeFolder } from '../_shared/purge.mjs';

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing token' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Who is asking comes from Supabase Auth, never from the body.
    const authed = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authed.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401);
    const userId = userData.user.id;

    const admin = createClient(url, serviceKey);

    // 1. Photos. `remove([folder])` deletes nothing — see _shared/purge.mjs.
    try {
      await purgeFolder(admin.storage.from('progress-photos'), userId);
    } catch (e) {
      return json({ error: 'Could not delete your photos, so the account was kept. Try again.', detail: String(e) }, 500);
    }

    // 2. The wearables account, if there is one. Its health data lives on
    //    another server, which the database cascade cannot reach.
    const { data: link, error: linkErr } = await admin
      .from('wearable_links')
      .select('ow_user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (linkErr) return json({ error: 'Could not check for linked wearables, so the account was kept.' }, 500);
    if (link?.ow_user_id) {
      const base = (Deno.env.get('OPEN_WEARABLES_URL') ?? '').replace(/\/+$/, '');
      const key = Deno.env.get('OPEN_WEARABLES_API_KEY') ?? '';
      if (!base || !key) {
        // A link exists, so this was configured once. Deleting the account
        // now would strand that data with no way back to it.
        return json({ error: 'Wearables data exists but OPEN_WEARABLES_URL / OPEN_WEARABLES_API_KEY are not set here, so it cannot be deleted. The account was kept.' }, 500);
      }
      const res = await fetch(`${base}/api/v1/users/${link.ow_user_id}`, {
        method: 'DELETE',
        headers: { 'X-Open-Wearables-API-Key': key },
      });
      if (!res.ok && res.status !== 404) {
        return json({ error: 'Could not delete your wearables data, so the account was kept. Try again.' }, 502);
      }
    }

    // 3. The account, last. Rows cascade.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
