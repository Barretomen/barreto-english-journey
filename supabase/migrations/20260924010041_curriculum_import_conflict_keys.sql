-- PostgREST upsert requires a non-partial unique index for ON CONFLICT.
-- PostgreSQL unique indexes already allow multiple NULL values, so the predicates
-- on these nullable legacy-compatible identifiers are unnecessary.
drop index if exists public.modules_external_id_idx;
create unique index modules_external_id_idx on public.modules (external_id);

drop index if exists public.lessons_external_id_idx;
create unique index lessons_external_id_idx on public.lessons (external_id);

drop index if exists public.lesson_blocks_external_id_idx;
create unique index lesson_blocks_external_id_idx on public.lesson_blocks (external_id);

drop index if exists public.exercises_external_id_idx;
create unique index exercises_external_id_idx on public.exercises (external_id);
