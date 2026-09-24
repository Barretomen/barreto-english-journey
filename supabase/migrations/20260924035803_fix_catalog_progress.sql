-- Keep catalog progress tied strictly to the signed-in student's own progress row.
-- The explicit NULL guard also prevents an untouched lesson from inheriting a
-- misleading percentage through planner/RLS interactions in the catalog query.
create or replace function public.get_lesson_catalog()
returns table (
  id bigint,
  external_id text,
  level_code text,
  level_position integer,
  module_id bigint,
  module_external_id text,
  module_title text,
  module_position integer,
  lesson_number integer,
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
    m.position,
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

revoke all on function public.get_lesson_catalog() from public;
grant execute on function public.get_lesson_catalog() to authenticated;
