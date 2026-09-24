alter table public.modules
  add column if not exists level_module_number integer;

with ranked as (
  select id, row_number() over (partition by level_code order by position, id)::integer as number
  from public.modules
  where external_id is not null
)
update public.modules m
set level_module_number = ranked.number
from ranked
where m.id = ranked.id and m.level_module_number is distinct from ranked.number;

alter table public.modules drop constraint if exists modules_level_module_number_check;
alter table public.modules add constraint modules_level_module_number_check
  check (level_module_number is null or level_module_number > 0);

create unique index if not exists modules_level_module_number_unique
  on public.modules(level_code, level_module_number)
  where external_id is not null;

drop function if exists public.get_lesson_catalog();
create function public.get_lesson_catalog()
returns table (
  id bigint,
  external_id text,
  level_code text,
  level_position integer,
  module_id bigint,
  module_external_id text,
  module_title text,
  module_number integer,
  level_lesson_number integer,
  module_lesson_number integer,
  global_order integer,
  title text,
  summary text,
  state text,
  is_checkpoint boolean,
  progress_percent integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.id,
    l.external_id,
    m.level_code,
    lv.position,
    m.id,
    m.external_id,
    m.title,
    m.level_module_number,
    l.level_lesson_number,
    l.module_lesson_number,
    l.global_order,
    l.title,
    l.summary,
    case
      when p.status = 'completed' then 'completed'
      when private.is_admin() and p.status = 'in_progress' then 'current'
      when private.is_admin() then 'available'
      when a.unlocked and p.status = 'in_progress' then 'current'
      when a.unlocked then 'available'
      else 'locked'
    end,
    l.is_checkpoint,
    case
      when p.lesson_id is null then 0
      when p.status = 'completed' then 100
      when p.status = 'in_progress' and blocks.total_blocks > 0 then
        least(99, round((coalesce(p.current_position, 0)::numeric / blocks.total_blocks) * 100)::integer)
      else 0
    end
  from public.lessons l
  join public.modules m on m.id = l.module_id
  join public.levels lv on lv.code = m.level_code
  left join public.student_lesson_access a
    on a.lesson_id = l.id
    and a.student_id = (select auth.uid())
    and a.unlocked
  left join public.lesson_progress p
    on p.lesson_id = l.id
    and p.student_id = (select auth.uid())
  left join lateral (
    select count(*)::integer as total_blocks
    from public.lesson_blocks b
    where b.lesson_id = l.id
  ) blocks on true
  where l.published and not l.is_legacy
  order by l.global_order
$$;

create or replace function public.get_lesson_detail(p_lesson_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or not private.can_access_lesson(p_lesson_id) then
    raise exception 'lesson_not_accessible' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', l.id,
    'external_id', l.external_id,
    'level_code', m.level_code,
    'level_lesson_number', l.level_lesson_number,
    'module_id', m.id,
    'module_external_id', m.external_id,
    'module_title', m.title,
    'module_number', m.level_module_number,
    'module_lesson_number', l.module_lesson_number,
    'global_order', l.global_order,
    'title', l.title,
    'summary', l.summary,
    'xp_reward', l.xp_reward,
    'is_checkpoint', l.is_checkpoint,
    'can_do', l.can_do,
    'metadata', l.metadata,
    'saved_position', coalesce((select p.current_position from public.lesson_progress p
      where p.student_id = (select auth.uid()) and p.lesson_id = l.id), 0),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'external_id', b.external_id, 'block_type', b.block_type,
      'position', b.position, 'title', b.title, 'content', b.content,
      'audio_path', b.audio_path, 'slow_audio_path', b.slow_audio_path,
      'audio_status', b.audio_status, 'audio_required', b.audio_required,
      'audio_role', b.audio_role, 'transcript', b.transcript,
      'exercise', case when e.id is null then null else jsonb_build_object(
        'id', e.id, 'external_id', e.external_id, 'exercise_type', e.exercise_type,
        'prompt', e.prompt, 'instruction', e.instruction, 'content', e.content,
        'feedback_correct', e.feedback_correct, 'feedback_incorrect', e.feedback_incorrect,
        'grading_mode', e.grading_mode,
        'options', coalesce((select jsonb_agg(jsonb_build_object(
          'id', o.id, 'label', o.label, 'value', o.value, 'position', o.position
        ) order by o.position) from public.exercise_options o where o.exercise_id = e.id), '[]'::jsonb)
      ) end
    ) order by b.position)
    from public.lesson_blocks b left join public.exercises e on e.lesson_block_id = b.id
    where b.lesson_id = l.id), '[]'::jsonb)
  ) into result
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.id = p_lesson_id and l.published and not l.is_legacy;

  if result is null then raise exception 'lesson_not_found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

revoke all on function public.get_lesson_catalog() from public, anon;
revoke all on function public.get_lesson_detail(bigint) from public, anon;
grant execute on function public.get_lesson_catalog() to authenticated;
grant execute on function public.get_lesson_detail(bigint) to authenticated;
grant execute on function public.get_lesson_catalog(), public.get_lesson_detail(bigint) to service_role;
