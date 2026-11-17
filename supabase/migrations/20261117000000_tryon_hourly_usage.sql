create table if not exists public.tryon_hourly_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  hour_bucket timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, hour_bucket)
);

alter table public.tryon_hourly_usage enable row level security;
revoke all on table public.tryon_hourly_usage from anon, authenticated;

create or replace function public.consume_tryon_quota()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_hour timestamptz := date_trunc('hour', now());
  current_count integer;
begin
  if current_user_id is null then
    return false;
  end if;

  insert into public.tryon_hourly_usage (user_id, hour_bucket, request_count)
  values (current_user_id, current_hour, 1)
  on conflict (user_id, hour_bucket)
  do update set request_count = public.tryon_hourly_usage.request_count + 1
  returning request_count into current_count;

  return current_count <= 5;
end;
$$;

revoke all on function public.consume_tryon_quota() from public, anon;
grant execute on function public.consume_tryon_quota() to authenticated;
