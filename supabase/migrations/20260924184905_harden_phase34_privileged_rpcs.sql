-- Keep privileged implementations outside the exposed Data API schema.
-- Public RPCs are security-invoker wrappers with narrowly scoped EXECUTE grants.

alter function public.mark_exercise_hint_used(bigint) set schema private;
alter function public.reveal_exercise_answer(bigint) set schema private;
alter function public.set_lesson_can_do_check(bigint, text, boolean) set schema private;
alter function public.claim_lesson_audio_segment_generation(bigint, text) set schema private;

revoke all on function private.mark_exercise_hint_used(bigint),
  private.reveal_exercise_answer(bigint),
  private.set_lesson_can_do_check(bigint, text, boolean),
  private.claim_lesson_audio_segment_generation(bigint, text)
  from public, anon, authenticated, service_role;
grant execute on function private.mark_exercise_hint_used(bigint),
  private.reveal_exercise_answer(bigint),
  private.set_lesson_can_do_check(bigint, text, boolean) to authenticated, service_role;
grant execute on function private.claim_lesson_audio_segment_generation(bigint, text) to service_role;

create function public.mark_exercise_hint_used(p_exercise_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.mark_exercise_hint_used(p_exercise_id) $$;

create function public.reveal_exercise_answer(p_exercise_id bigint)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.reveal_exercise_answer(p_exercise_id) $$;

create function public.set_lesson_can_do_check(
  p_lesson_id bigint,
  p_item_key text,
  p_checked boolean
)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.set_lesson_can_do_check(p_lesson_id, p_item_key, p_checked) $$;

create function public.claim_lesson_audio_segment_generation(
  p_segment_id bigint,
  p_text_hash text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.claim_lesson_audio_segment_generation(p_segment_id, p_text_hash) $$;

revoke all on function public.mark_exercise_hint_used(bigint),
  public.reveal_exercise_answer(bigint),
  public.set_lesson_can_do_check(bigint, text, boolean),
  public.claim_lesson_audio_segment_generation(bigint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_exercise_hint_used(bigint),
  public.reveal_exercise_answer(bigint),
  public.set_lesson_can_do_check(bigint, text, boolean) to authenticated, service_role;
grant execute on function public.claim_lesson_audio_segment_generation(bigint, text) to service_role;
