-- Interleave every A1 exercise with its teaching section without recreating rows.
-- Exercise/block IDs, attempts, progress and XP remain untouched; only positions move.
do $$
declare
  invalid_lessons integer;
begin
  update public.lesson_blocks b
  set position = b.position + 1000
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where b.lesson_id = l.id
    and m.level_code = 'A1'
    and not l.is_legacy;

  with ranked as (
    select
      b.id,
      row_number() over (
        partition by b.lesson_id
        order by
          case
            when b.external_id like '%-B-overview' then 10
            when b.external_id like '%-B-visual' then 20
            when b.external_id like '%-B-vocabulary' then 30
            when b.external_id ~ '-B-exercise-.*-e01$' then 40
            when b.external_id like '%-B-grammar' then 50
            when b.external_id ~ '-B-exercise-.*-e02$' then 60
            when b.external_id like '%-B-pronunciation' then 70
            when b.external_id ~ '-B-exercise-.*-e03$' then 80
            when b.external_id like '%-B-listening' then 90
            when b.external_id ~ '-B-exercise-.*-e04$' then 100
            when b.external_id like '%-B-speaking' then 200
            when b.external_id like '%-B-assessment' then 210
            else 190
          end,
          b.external_id
      )::integer as new_position
    from public.lesson_blocks b
    join public.lessons l on l.id = b.lesson_id
    join public.modules m on m.id = l.module_id
    where m.level_code = 'A1'
      and not l.is_legacy
  )
  update public.lesson_blocks b
  set position = ranked.new_position
  from ranked
  where b.id = ranked.id;

  select count(*) into invalid_lessons
  from (
    select l.id
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.lesson_blocks b on b.lesson_id = l.id
    where m.level_code = 'A1'
      and not l.is_legacy
    group by l.id
    having count(*) not in (11, 12)
       or min(b.position) <> 1
       or max(b.position) <> count(*)
  ) invalid;

  if invalid_lessons <> 0 then
    raise exception 'A1 practice reorder validation failed for % lesson(s)', invalid_lessons;
  end if;
end;
$$;
