-- Preserve the Phase 1 explicit learner-facing module contract while returning
-- the Phase 3 audio/checklist/assistance additions.
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
    'id', l.id, 'external_id', l.external_id, 'level_code', m.level_code,
    'level_lesson_number', l.level_lesson_number, 'module_id', m.id,
    'module_external_id', m.external_id, 'module_title', m.title,
    'module_number', m.level_module_number, 'module_lesson_number', l.module_lesson_number,
    'global_order', l.global_order, 'title', l.title, 'summary', l.summary,
    'xp_reward', l.xp_reward, 'is_checkpoint', l.is_checkpoint,
    'can_do', l.can_do, 'metadata', l.metadata, 'content_version', l.course_version,
    'can_do_checks', coalesce((select jsonb_object_agg(c.item_key, c.checked)
      from public.lesson_can_do_checks c where c.student_id = (select auth.uid())
      and c.lesson_id = l.id), '{}'::jsonb),
    'saved_position', coalesce((select p.current_position from public.lesson_progress p
      where p.student_id = (select auth.uid()) and p.lesson_id = l.id), 0),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'external_id', b.external_id, 'block_type', b.block_type,
      'position', b.position, 'title', b.title, 'content', b.content,
      'audio_path', b.audio_path, 'slow_audio_path', b.slow_audio_path,
      'audio_status', b.audio_status, 'audio_required', b.audio_required,
      'audio_role', b.audio_role, 'transcript', b.transcript,
      'audio_segments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'external_id', s.external_id, 'item_key', s.item_key,
        'segment_kind', s.segment_kind, 'position', s.position,
        'speech_text', s.speech_text, 'status', s.audio_status
      ) order by s.position, s.id) from public.lesson_audio_segments s
      where s.lesson_block_id = b.id), '[]'::jsonb),
      'exercise', case when e.id is null then null else jsonb_build_object(
        'id', e.id, 'external_id', e.external_id, 'exercise_type', e.exercise_type,
        'prompt', e.prompt, 'instruction', e.instruction, 'content', e.content,
        'feedback_correct', e.feedback_correct, 'feedback_incorrect', e.feedback_incorrect,
        'grading_mode', e.grading_mode,
        'assistance', coalesce((select jsonb_build_object(
          'hint_used', a.hint_used, 'answer_revealed', a.answer_revealed
        ) from public.exercise_assistance a where a.student_id = (select auth.uid())
          and a.exercise_id = e.id), jsonb_build_object('hint_used', false, 'answer_revealed', false)),
        'options', coalesce((select jsonb_agg(jsonb_build_object(
          'id', o.id, 'label', o.label, 'value', o.value, 'position', o.position
        ) order by o.position) from public.exercise_options o where o.exercise_id = e.id), '[]'::jsonb)
      ) end
    ) order by b.position)
    from public.lesson_blocks b left join public.exercises e on e.lesson_block_id = b.id
    where b.lesson_id = l.id), '[]'::jsonb)
  ) into result
  from public.lessons l join public.modules m on m.id = l.module_id
  where l.id = p_lesson_id and l.published and not l.is_legacy;
  if result is null then raise exception 'lesson_not_found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

revoke all on function public.get_lesson_detail(bigint) from public, anon;
grant execute on function public.get_lesson_detail(bigint) to authenticated, service_role;
