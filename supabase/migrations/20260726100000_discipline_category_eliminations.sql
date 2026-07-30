alter table public.registration_categories
  add column if not exists status text not null default 'active',
  add column if not exists eliminated_at timestamptz,
  add column if not exists elimination_reason text,
  add column if not exists eliminated_by text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'registration_categories_status_check'
      and conrelid = 'public.registration_categories'::regclass
  ) then
    alter table public.registration_categories
      add constraint registration_categories_status_check
      check (status in ('active', 'eliminated_faults'));
  end if;
end $$;

create index if not exists registration_categories_status_idx
  on public.registration_categories (status);
