-- Keep the privileged diagnostics implementation outside the exposed schema.

alter function public.get_admin_curriculum_diagnostics_v1() set schema private;
alter function public.get_admin_curriculum_diagnostics() set schema private;

create or replace function private.get_admin_curriculum_diagnostics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  empty_blocks bigint;
begin
  if not private.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  result := private.get_admin_curriculum_diagnostics_v1();
  select count(*) into empty_blocks
  from public.lesson_blocks b
  left join public.exercises e on e.lesson_block_id = b.id
  where b.content = '{}'::jsonb
    and e.id is null
    and nullif(btrim(b.title), '') is null
    and nullif(btrim(b.transcript), '') is null;
  return jsonb_set(result, '{problems,empty_lesson_blocks}', to_jsonb(empty_blocks), true);
end;
$$;

revoke all on function private.get_admin_curriculum_diagnostics_v1(),
  private.get_admin_curriculum_diagnostics() from public, anon, authenticated, service_role;
grant execute on function private.get_admin_curriculum_diagnostics() to authenticated, service_role;

create function public.get_admin_curriculum_diagnostics()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_admin_curriculum_diagnostics() $$;

revoke all on function public.get_admin_curriculum_diagnostics()
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_curriculum_diagnostics() to authenticated, service_role;
