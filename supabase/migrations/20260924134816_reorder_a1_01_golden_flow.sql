-- Interleave the existing stable A1-01 exercise blocks with their teaching sections.
-- IDs and attempts are preserved; only the learner-facing block positions change.
do $$
declare target_lesson_id bigint;
begin
  select id into target_lesson_id from public.lessons
  where external_id = 'A1-01' and not is_legacy;
  if target_lesson_id is null then raise exception 'A1-01 not found'; end if;

  update public.lesson_blocks set position = position + 100
  where lesson_id = target_lesson_id;

  update public.lesson_blocks set position = case external_id
    when 'A1-01-B-overview' then 1
    when 'A1-01-B-visual' then 2
    when 'A1-01-B-vocabulary' then 3
    when 'A1-01-B-exercise-a1-01-e01' then 4
    when 'A1-01-B-grammar' then 5
    when 'A1-01-B-exercise-a1-01-e02' then 6
    when 'A1-01-B-pronunciation' then 7
    when 'A1-01-B-exercise-a1-01-e03' then 8
    when 'A1-01-B-listening' then 9
    when 'A1-01-B-exercise-a1-01-e04' then 10
    when 'A1-01-B-speaking' then 11
    when 'A1-01-B-assessment' then 12
    else position
  end
  where lesson_id = target_lesson_id;

  if (select count(*) from public.lesson_blocks where lesson_id = target_lesson_id and position between 1 and 12) <> 12 then
    raise exception 'Unexpected A1-01 block set';
  end if;
end;
$$;
