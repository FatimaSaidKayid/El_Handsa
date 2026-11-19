create table if not exists public.teacher_allowlist (
  email text primary key check (email = lower(email))
);
alter table public.teacher_allowlist enable row level security;
revoke all on public.teacher_allowlist from anon, authenticated;
insert into public.teacher_allowlist(email)
values ('fatimasaidkayed@gmail.com')
on conflict (email) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'student' check (role in ('student','teacher')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare account_role text := 'student';
begin
  if exists (select 1 from public.teacher_allowlist where email = lower(new.email)) then
    account_role := 'teacher';
  end if;
  insert into public.profiles(id,email,role)
  values(new.id,lower(new.email),account_role)
  on conflict (id) do update set email=excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Backfill users that already exist before the trigger was installed.
insert into public.profiles(id,email,role)
select u.id,lower(u.email),
  case when exists(select 1 from public.teacher_allowlist a where a.email=lower(u.email))
       then 'teacher' else 'student' end
from auth.users u
on conflict (id) do update set email=excluded.email, role=excluded.role;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
for select to authenticated using (id = auth.uid());

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  grade smallint not null check (grade between 1 and 3),
  description text default '',
  storage_path text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.lessons enable row level security;

drop policy if exists "Authenticated users can view lessons" on public.lessons;
create policy "Authenticated users can view lessons" on public.lessons
for select to authenticated using (true);

drop policy if exists "Teachers can add lessons" on public.lessons;
create policy "Teachers can add lessons" on public.lessons
for insert to authenticated
with check (created_by = auth.uid() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher'
));

drop policy if exists "Teachers can delete lessons" on public.lessons;
create policy "Teachers can delete lessons" on public.lessons
for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
);

-- Public playback URLs; uploading/deleting is still restricted by Storage RLS below.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('lesson-videos','lesson-videos',true,104857600,
  array['video/mp4','video/webm','video/quicktime','video/x-m4v','video/3gpp'])
on conflict (id) do update set public=true,file_size_limit=104857600;

drop policy if exists "Teachers upload lesson videos" on storage.objects;
create policy "Teachers upload lesson videos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'lesson-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher')
);

drop policy if exists "Teachers update lesson videos" on storage.objects;
create policy "Teachers update lesson videos" on storage.objects
for update to authenticated using (
  bucket_id='lesson-videos'
  and exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher')
) with check (bucket_id='lesson-videos');

drop policy if exists "Teachers delete lesson videos" on storage.objects;
create policy "Teachers delete lesson videos" on storage.objects
for delete to authenticated using (
  bucket_id='lesson-videos'
  and exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='teacher')
);

