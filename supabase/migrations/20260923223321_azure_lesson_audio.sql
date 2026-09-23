alter table public.lesson_blocks
  add column audio_path text,
  add column slow_audio_path text,
  add column audio_status text not null default 'missing'
    check (audio_status in ('missing', 'generating', 'ready', 'failed')),
  add column audio_voice text,
  add column audio_locale text,
  add column audio_generated_at timestamptz,
  add column audio_generation_started_at timestamptz,
  add column audio_text_hash text,
  add column audio_error text,
  add column tts_config jsonb not null default '{}'::jsonb;

create index lesson_blocks_audio_status_idx
  on public.lesson_blocks (audio_status)
  where block_type in ('vocabulary', 'example', 'listening', 'speaking');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-audio', 'lesson-audio', false, 5242880, array['audio/mpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No authenticated storage.objects policy is intentional. Audio is delivered only
-- through short-lived signed URLs after the Edge Function verifies lesson access.

create or replace function public.get_admin_audio_overview()
returns table (
  lesson_id bigint,
  lesson_number integer,
  title text,
  ready_count bigint,
  missing_count bigint,
  generating_count bigint,
  failed_count bigint,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.lesson_number,
    l.title,
    count(b.id) filter (where b.audio_status = 'ready'),
    count(b.id) filter (where b.audio_status = 'missing'),
    count(b.id) filter (where b.audio_status = 'generating'),
    count(b.id) filter (where b.audio_status = 'failed'),
    count(b.id)
  from public.lessons l
  left join public.lesson_blocks b
    on b.lesson_id = l.id
   and b.block_type in ('vocabulary', 'example', 'listening', 'speaking')
  where l.published
  group by l.id, l.lesson_number, l.title, l.position
  order by l.position;
end;
$$;

create or replace function public.claim_lesson_audio_generation(
  p_block_id bigint,
  p_text_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed boolean;
begin
  update public.lesson_blocks
  set audio_status = 'generating',
      audio_generation_started_at = now(),
      audio_text_hash = p_text_hash,
      audio_error = null
  where id = p_block_id
    and (
      audio_status <> 'generating'
      or audio_generation_started_at < now() - interval '10 minutes'
    );

  claimed := found;
  return claimed;
end;
$$;

revoke all on function public.get_admin_audio_overview() from public, anon;
grant execute on function public.get_admin_audio_overview() to authenticated;

revoke all on function public.claim_lesson_audio_generation(bigint, text)
  from public, anon, authenticated;
grant execute on function public.claim_lesson_audio_generation(bigint, text)
  to service_role;
