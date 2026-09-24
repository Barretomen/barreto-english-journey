-- The Edge Function calls this RPC with its service-role client. Match the
-- existing block-audio claim pattern: invoker privileges and service-role-only EXECUTE.
create or replace function public.claim_lesson_audio_segment_generation(
  p_segment_id bigint,
  p_text_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare claimed boolean := false;
begin
  update public.lesson_audio_segments set
    audio_status = 'generating', audio_generation_started_at = now(),
    audio_text_hash = p_text_hash, audio_error = null
  where id = p_segment_id and (
    audio_status in ('missing', 'failed')
    or audio_text_hash is distinct from p_text_hash
    or audio_generation_started_at < now() - interval '10 minutes'
  );
  claimed := found;
  return claimed;
end;
$$;

revoke all on function public.claim_lesson_audio_segment_generation(bigint, text)
  from public, anon, authenticated;
grant execute on function public.claim_lesson_audio_segment_generation(bigint, text)
  to service_role;
