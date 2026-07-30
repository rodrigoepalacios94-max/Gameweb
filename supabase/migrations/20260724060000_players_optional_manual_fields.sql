update public.players
set
  document = nullif(btrim(document), ''),
  phone = nullif(btrim(phone), ''),
  address = nullif(btrim(address), ''),
  gender = nullif(btrim(gender), '')
where document = ''
  or phone = ''
  or address = ''
  or gender = '';

alter table public.players
  alter column document drop not null;

drop index if exists public.players_document_unique;

create unique index if not exists players_document_unique_when_present
on public.players (document)
where document is not null and btrim(document) <> '';

alter table public.players
  drop constraint if exists players_phone_digits_optional,
  add constraint players_phone_digits_optional check (
    phone is null
    or btrim(phone) = ''
    or phone ~ '^[0-9]+$'
  );
