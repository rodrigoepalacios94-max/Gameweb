alter table public.payments
  add column if not exists external_reference text,
  add column if not exists status_detail text,
  add column if not exists raw_status text,
  add column if not exists last_provider_update_at timestamptz,
  add column if not exists review_required boolean not null default false,
  add column if not exists review_reason text,
  add column if not exists provider_init_point text,
  add column if not exists provider_sandbox_init_point text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

create index if not exists payments_registration_provider_idx
  on public.payments(registration_id, provider, created_at desc);

create index if not exists payments_external_reference_idx
  on public.payments(provider, external_reference);

create unique index if not exists payments_provider_payment_unique_idx
  on public.payments(provider, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists payments_review_required_idx
  on public.payments(review_required)
  where review_required = true;

drop policy if exists "payments_insert_own" on public.payments;

create or replace function public.create_registration_for_player(
  p_player_id uuid,
  p_tournament_id uuid,
  p_category_ids uuid[],
  p_payment_mode text default 'later'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_registration_id uuid;
  v_due_at timestamptz;
  v_unit_price numeric(12,2);
  v_category_count integer;
  v_subtotal numeric(12,2);
  v_discount_percent numeric(5,2);
  v_discount_amount numeric(12,2);
  v_total numeric(12,2);
  v_payment_status text;
  v_payment_provider text;
  v_payment_method text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.is_admin() and p_player_id is distinct from public.current_player_id() then
    raise exception 'PLAYER_FORBIDDEN';
  end if;

  if p_payment_mode not in ('later', 'mercadopago') then
    raise exception 'MODO_PAGO_INVALIDO';
  end if;

  select * into v_tournament from public.tournaments where id = p_tournament_id;
  if not found then
    raise exception 'TORNEO_NO_ENCONTRADO';
  end if;
  if v_tournament.status <> 'open' then
    raise exception 'TORNEO_SIN_INSCRIPCIONES_ABIERTAS';
  end if;
  if p_category_ids is null or coalesce(array_length(p_category_ids, 1), 0) = 0 then
    raise exception 'CATEGORIA_REQUERIDA';
  end if;
  if exists (
    select 1 from public.registrations
    where player_id = p_player_id
      and tournament_id = p_tournament_id
      and status <> 'cancelled'
  ) then
    raise exception 'JUGADOR_YA_INSCRIPTO_EN_TORNEO';
  end if;

  v_due_at := (v_tournament.start_date::timestamptz - interval '3 days');
  if p_payment_mode = 'later' and now() >= v_due_at then
    raise exception 'PAGO_POSTERIOR_NO_DISPONIBLE';
  end if;

  select count(*) into v_category_count
  from public.tournament_categories tc
  where tc.tournament_id = p_tournament_id
    and tc.category_id = any(p_category_ids);
  if v_category_count <> coalesce(array_length(p_category_ids, 1), 0) then
    raise exception 'CATEGORIA_INVALIDA_PARA_TORNEO';
  end if;

  select coalesce(max(pb.discount_percent), 0) into v_discount_percent
  from public.player_benefits pb
  where pb.player_id = p_player_id
    and pb.revoked_at is null
    and pb.starts_at <= current_date
    and (pb.ends_at is null or pb.ends_at >= current_date);

  v_unit_price := coalesce(v_tournament.price_per_category, 0);
  v_subtotal := v_unit_price * v_category_count;
  v_discount_amount := round(v_subtotal * v_discount_percent / 100, 2);
  v_total := greatest(v_subtotal - v_discount_amount, 0);
  v_payment_status := case when v_total = 0 then 'waived' else 'pending' end;
  v_payment_provider := case
    when v_total = 0 then 'waiver'
    when p_payment_mode = 'mercadopago' then 'mercadopago'
    else 'pending'
  end;
  v_payment_method := case when v_total = 0 then 'waiver' else null end;

  insert into public.registrations (
    player_id,
    tournament_id,
    status,
    payment_status,
    payment_due_at,
    unit_price,
    category_count,
    subtotal,
    subtotal_amount,
    benefit_percentage,
    discount_percent,
    discount_amount,
    total_amount,
    amount_breakdown
  ) values (
    p_player_id,
    p_tournament_id,
    'confirmed',
    v_payment_status,
    v_due_at,
    v_unit_price,
    v_category_count,
    v_subtotal,
    v_subtotal,
    v_discount_percent,
    v_discount_percent,
    v_discount_amount,
    v_total,
    jsonb_build_object(
      'categoryIds', p_category_ids,
      'unitPrice', v_unit_price,
      'subtotal', v_subtotal,
      'discountAmount', v_discount_amount,
      'benefitPercentage', v_discount_percent,
      'total', v_total,
      'waived', v_total = 0
    )
  )
  returning id into v_registration_id;

  insert into public.registration_categories (registration_id, tournament_category_id, category_name, unit_price)
  select
    v_registration_id,
    tc.id,
    c.name || ' ' || c.branch,
    v_unit_price
  from public.tournament_categories tc
  join public.categories c on c.id = tc.category_id
  where tc.tournament_id = p_tournament_id
    and tc.category_id = any(p_category_ids);

  insert into public.payments (
    registration_id,
    player_id,
    tournament_id,
    provider,
    external_reference,
    amount,
    status,
    payment_method,
    amount_breakdown,
    approved_at
  ) values (
    v_registration_id,
    p_player_id,
    p_tournament_id,
    v_payment_provider,
    v_registration_id::text,
    v_total,
    case when v_payment_status = 'pending' then 'pending' else 'approved' end,
    v_payment_method,
    jsonb_build_object(
      'categoryIds', p_category_ids,
      'unitPrice', v_unit_price,
      'subtotal', v_subtotal,
      'discountAmount', v_discount_amount,
      'benefitPercentage', v_discount_percent,
      'total', v_total,
      'waived', v_total = 0
    ),
    case when v_payment_status = 'pending' then null else now() end
  );

  return v_registration_id;
end;
$$;

revoke all on function public.create_registration_for_player(uuid, uuid, uuid[], text) from anon;
grant execute on function public.create_registration_for_player(uuid, uuid, uuid[], text) to authenticated;

create or replace function public.mark_registration_paid_manual(
  p_registration_id uuid,
  p_actor text default 'admin-1'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.registrations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select * into v_registration from public.registrations where id = p_registration_id and status <> 'cancelled';
  if not found then
    raise exception 'INSCRIPCION_NO_ENCONTRADA';
  end if;

  if v_registration.payment_status in ('paid', 'waived') then
    return p_registration_id;
  end if;

  update public.registrations
  set payment_status = 'paid', updated_at = now()
  where id = p_registration_id;

  insert into public.payments (
    registration_id,
    player_id,
    tournament_id,
    provider,
    external_reference,
    amount,
    status,
    payment_method,
    amount_breakdown,
    approved_by,
    approved_at
  ) values (
    p_registration_id,
    v_registration.player_id,
    v_registration.tournament_id,
    'manual',
    p_registration_id::text,
    v_registration.total_amount,
    'approved',
    'manual',
    v_registration.amount_breakdown,
    p_actor,
    now()
  );

  return p_registration_id;
end;
$$;

revoke all on function public.mark_registration_paid_manual(uuid, text) from anon;
grant execute on function public.mark_registration_paid_manual(uuid, text) to authenticated;
