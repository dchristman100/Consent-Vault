-- Add user_id column to sites table to track ownership
alter table public.sites
add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Create INSERT policy for authenticated users
create policy "Authenticated users can insert their own sites"
on public.sites
for insert
to authenticated
with check (auth.uid() = user_id);

-- Create UPDATE policy for authenticated users to update their own sites
create policy "Authenticated users can update their own sites"
on public.sites
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Create DELETE policy for authenticated users to delete their own sites
create policy "Authenticated users can delete their own sites"
on public.sites
for delete
to authenticated
using (auth.uid() = user_id);

-- Update existing SELECT policy to scope by user_id
drop policy if exists "authenticated_read_sites" on public.sites;
create policy "Authenticated users can read their own sites"
on public.sites
for select
to authenticated
using (auth.uid() = user_id);
