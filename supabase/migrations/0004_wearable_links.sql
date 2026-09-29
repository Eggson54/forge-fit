-- Which Open Wearables user belongs to which ForgeFit account.
--
-- The wearables proxy used to take that id from the request — from a text
-- box in the app, in fact — and fetch the summaries with a master key that
-- can read every user on the deployment. Typing somebody else's id imported
-- their sleep, activity and recovery. The id now comes from here, looked up
-- from the caller's verified session, and never from anything they send.
--
-- Rules:
-- 1. Read your own row, and only your own row.
-- 2. Nobody but the server writes. A link a client could insert is the same
--    hole again: RLS can check that user_id is yours, but not that the
--    wearables account on the other end is. So there is no insert, update or
--    delete policy at all, and the server writes with the service role
--    after creating the wearables account itself.
-- 3. Deleting the account deletes the link (cascade), and the delete-account
--    function deletes the wearables account on the other end first.

create table if not exists public.wearable_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ow_user_id uuid not null unique,
  created_at timestamptz not null default now()
);

alter table public.wearable_links enable row level security;

drop policy if exists "wearable_links: read own" on public.wearable_links;
create policy "wearable_links: read own"
  on public.wearable_links
  for select
  using (user_id = auth.uid());

-- Deliberately no insert / update / delete policies. See rule 2.
revoke insert, update, delete on public.wearable_links from anon, authenticated;
