-- Create password_reset_tokens table for managing password reset tokens
create table if not exists public.password_reset_tokens (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  token_hash text not null unique,
  expires_at timestamp with time zone not null,
  used_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Create indexes for faster lookups
create index if not exists idx_password_reset_tokens_email on public.password_reset_tokens(email);
create index if not exists idx_password_reset_tokens_token_hash on public.password_reset_tokens(token_hash);
create index if not exists idx_password_reset_tokens_expires_at on public.password_reset_tokens(expires_at);

-- Enable RLS
alter table public.password_reset_tokens enable row level security;

-- Create policy to allow service role to manage tokens
create policy "Allow service role to manage tokens"
on public.password_reset_tokens
for all
to service_role
using (true)
with check (true);

-- Create function to auto-update updated_at timestamp
create or replace function public.update_password_reset_tokens_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger for updated_at
drop trigger if exists update_password_reset_tokens_timestamp_trigger on public.password_reset_tokens;
create trigger update_password_reset_tokens_timestamp_trigger
before update on public.password_reset_tokens
for each row
execute function public.update_password_reset_tokens_timestamp();
