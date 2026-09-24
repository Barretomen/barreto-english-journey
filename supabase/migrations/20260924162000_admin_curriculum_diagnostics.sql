alter table public.lessons
  add column if not exists content_schema_version text not null default '2.0-specialized-sections';

update public.lessons
set content_schema_version = '2.0-specialized-sections'
where content_schema_version <> '2.0-specialized-sections';

create or replace function public.get_admin_curriculum_diagnostics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'curriculum_version', coalesce(max(l.course_version), 'unknown'),
    'content_schema_version', coalesce(max(l.content_schema_version), 'unknown'),
    'lessons_expected', 360,
    'lessons_actual', count(*) filter (where l.published and not l.is_legacy),
    'golden_blocks', (select count(*) from public.lesson_blocks b join public.lessons gl on gl.id = b.lesson_id where gl.external_id = 'A1-01'),
    'visual_assets_expected', 401,
    'visual_assets_actual', (select count(*) from public.lesson_assets),
    'required_audio', (select jsonb_build_object(
      'ready', count(*) filter (where b.audio_status = 'ready'),
      'missing', count(*) filter (where b.audio_status = 'missing'),
      'generating', count(*) filter (where b.audio_status = 'generating'),
      'failed', count(*) filter (where b.audio_status = 'failed')
    ) from public.lesson_blocks b where b.audio_required),
    'vocabulary_segments', (select jsonb_build_object(
      'ready', count(*) filter (where s.audio_status = 'ready'),
      'missing', count(*) filter (where s.audio_status = 'missing'),
      'generating', count(*) filter (where s.audio_status = 'generating'),
      'failed', count(*) filter (where s.audio_status = 'failed')
    ) from public.lesson_audio_segments s where s.segment_kind in ('term', 'example')),
    'problems', jsonb_build_object(
      'empty_lesson_blocks', (select count(*) from public.lesson_blocks b where b.content = '{}'::jsonb),
      'missing_translations', (
        select count(*) from (
          select b.id from public.lesson_blocks b join public.lessons al on al.id = b.lesson_id join public.modules am on am.id = al.module_id
          where am.level_code = 'A1' and not al.is_legacy and (
            (b.block_type in ('overview', 'assessment') and coalesce(jsonb_array_length(b.content->'can_do_pt'), 0) = 0)
            or (b.block_type = 'grammar' and coalesce(jsonb_array_length(b.content->'items_pt'), 0) = 0)
            or (b.block_type = 'pronunciation' and coalesce(jsonb_array_length(b.content->'items_pt'), 0) = 0)
            or (b.block_type = 'listening' and (nullif(btrim(b.content->>'task_translation'), '') is null or nullif(btrim(b.content->>'script_translation'), '') is null))
            or (b.block_type = 'speaking' and nullif(btrim(b.content->>'prompt_translation'), '') is null)
          )
          union all
          select b.id from public.lesson_blocks b join public.lessons al on al.id = b.lesson_id join public.modules am on am.id = al.module_id
          where am.level_code = 'A1' and not al.is_legacy and b.block_type = 'vocabulary'
            and exists (select 1 from jsonb_array_elements(b.content->'items') item where nullif(btrim(item->>'example_translation'), '') is null)
          union all
          select b.id from public.lesson_blocks b join public.exercises e on e.lesson_block_id = b.id
            join public.lessons al on al.id = b.lesson_id join public.modules am on am.id = al.module_id
          where am.level_code = 'A1' and not al.is_legacy and nullif(btrim(e.content->>'prompt_translation'), '') is null
        ) missing
      ),
      'missing_visuals', (select count(*) from public.lessons vl
        where vl.published and not vl.is_legacy and not exists (select 1 from public.lesson_assets a where a.lesson_id = vl.id)),
      'dirty_tts_text', (
        (select count(*) from public.lesson_blocks b where b.audio_required and (
          nullif(btrim(b.transcript), '') is null or b.transcript like '%\_%' escape '\'
          or lower(b.transcript) like '%undefined%' or lower(b.transcript) like '%[object object]%'
        ))
        + (select count(*) from public.lesson_audio_segments s where
          nullif(btrim(s.normalized_text), '') is null or s.normalized_text like '%\_%' escape '\'
          or lower(s.normalized_text) like '%undefined%' or lower(s.normalized_text) like '%[object object]%')
      ),
      'missing_required_audio', (
        (select count(*) from public.lesson_blocks b where b.audio_required and b.audio_status <> 'ready')
        + (select count(*) from public.lesson_audio_segments s where s.audio_status <> 'ready')
      )
    )
  ) into result
  from public.lessons l;
  return result;
end;
$$;

revoke all on function public.get_admin_curriculum_diagnostics() from public, anon;
grant execute on function public.get_admin_curriculum_diagnostics() to authenticated, service_role;
