-- MicroManus schema. Run once in the Supabase SQL editor.
-- Credits are an append-only ledger: balance = sum(grants) - sum(spends).

-- ─── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── threads & messages ──────────────────────────────────────────────────────
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index threads_user_idx on public.threads (user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- { text, steps: [{type, ...}], artifacts: [{name, path}], error? }
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at);

-- ─── credit ledger ───────────────────────────────────────────────────────────
create table public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount int not null check (amount > 0),
  source text not null check (source in ('coupon', 'stripe')),
  source_ref text not null, -- coupon code, or Stripe checkout session id
  created_at timestamptz not null default now()
);
-- Idempotency: a user can redeem a given coupon once; a Stripe session id
-- grants once no matter how often the webhook retries.
create unique index credit_grants_dedupe
  on public.credit_grants (user_id, source_ref);

create table public.credit_spends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid references public.threads (id) on delete set null,
  amount int not null check (amount > 0),
  reason text not null default 'agent_run',
  created_at timestamptz not null default now()
);
create index credit_spends_user_idx on public.credit_spends (user_id);
create index credit_grants_user_idx on public.credit_grants (user_id);

-- ─── BYO LLM key (server-only, AES-256-GCM encrypted) ────────────────────────
create table public.api_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'moonshot')),
  base_url text not null,
  model text not null,
  encrypted_key text not null, -- iv.ciphertext.authTag, base64
  key_hint text not null,      -- last 4 chars, for display only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── usage events (one row per model call) ───────────────────────────────────
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null references public.threads (id) on delete cascade,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cached_tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index usage_events_user_thread_idx
  on public.usage_events (user_id, thread_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.credit_grants enable row level security;
alter table public.credit_spends enable row level security;
alter table public.api_keys enable row level security;
alter table public.usage_events enable row level security;

-- Users can read their own rows.
create policy "own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "own threads" on public.threads
  for select using (auth.uid() = user_id);
create policy "own messages" on public.messages
  for select using (auth.uid() = user_id);
create policy "own grants" on public.credit_grants
  for select using (auth.uid() = user_id);
create policy "own spends" on public.credit_spends
  for select using (auth.uid() = user_id);
create policy "own usage" on public.usage_events
  for select using (auth.uid() = user_id);
-- api_keys: NO user-facing policies. Only the service role touches this table,
-- so the encrypted key can never leak through the client API.

-- All writes (grants, spends, usage, keys, threads, messages) go through
-- server routes using the service role, which bypasses RLS. No insert/update
-- policies are defined for authenticated users on purpose.

-- ─── artifacts bucket (PDF reports; served via signed URLs) ──────────────────
insert into storage.buckets (id, name, public)
values ('artifacts', 'artifacts', false)
on conflict (id) do nothing;
