-- =====================================================================
-- A LINK CRM — 005 portal-style package composer (like b2btourportal.com)
--   * region groups (state cards) → regions (package cards) with photos
--   * pickup / drop points linked to a city
--   * vehicles master + per-place vehicle rates (AC / non-AC)
--   * places (day plans) with photos + night-stay options
--   * hotels with photos + description
--   * day rows store hotel category / hotel / room type (like the portal)
--   * offers / discount / promotional notices
-- Run after 004. Safe to re-run.
-- =====================================================================

-- helper: standard masters RLS for a table
create or replace function public._crm_masters_rls(t text) returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', t || '_sel', t);
  execute format('drop policy if exists %I on public.%I', t || '_ins', t);
  execute format('drop policy if exists %I on public.%I', t || '_upd', t);
  execute format('drop policy if exists %I on public.%I', t || '_del', t);
  execute format('create policy %I on public.%I for select to authenticated using ((select public.is_active_user()))', t || '_sel', t);
  execute format('create policy %I on public.%I for insert to authenticated with check ((select public.has_perm(''masters'',''create'')))', t || '_ins', t);
  execute format('create policy %I on public.%I for update to authenticated using ((select public.has_perm(''masters'',''edit'')))', t || '_upd', t);
  execute format('create policy %I on public.%I for delete to authenticated using ((select public.has_perm(''masters'',''delete'')))', t || '_del', t);
  execute format('grant all on public.%I to authenticated, service_role', t);
  execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_activity()', t || '_audit', t);
end $$;
revoke all on function public._crm_masters_rls(text) from public, anon, authenticated;

-- 1. Region groups ("Jammu Kashmir and Ladakh") → regions ("Kashmir Tour Packages")
create table if not exists public.region_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  image_url text,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
select public._crm_masters_rls('region_groups');

alter table public.regions add column if not exists group_id uuid references public.region_groups(id) on delete set null;
alter table public.regions add column if not exists image_url text;
alter table public.regions add column if not exists terms text;              -- extra T&C for this package type
alter table public.regions add column if not exists min_nights int not null default 1;
alter table public.regions add column if not exists max_nights int not null default 15;
create index if not exists regions_group_idx on public.regions(group_id);

insert into public.region_groups (name, sort) values ('Jammu Kashmir and Ladakh', 1), ('Himachal Pradesh', 2)
on conflict (name) do nothing;
update public.regions r set group_id = g.id from public.region_groups g
where r.group_id is null and (
  (g.name = 'Jammu Kashmir and Ladakh' and r.name ~* '(kashmir|leh|ladakh|vaishno|jammu)')
  or (g.name = 'Himachal Pradesh' and r.name ~* '(himachal|manali|shimla)')
);

-- 2. Pickup / drop points (each linked to the city the trip starts / ends in)
create table if not exists public.pickup_points (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  name text not null,                                   -- "Srinagar Airport / Railway Station"
  destination_id uuid references public.destinations(id) on delete set null,  -- city: Srinagar
  is_pickup boolean not null default true,
  is_drop boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists pickup_points_region_idx on public.pickup_points(region_id);
create index if not exists pickup_points_destination_idx on public.pickup_points(destination_id);
select public._crm_masters_rls('pickup_points');

-- copy the old one-per-line text into rows (once)
insert into public.pickup_points (region_id, name, destination_id, sort)
select r.id, trim(p.name), (
  select d.id from public.destinations d
  where d.region_id = r.id and lower(trim(p.name)) like lower(split_part(d.name, ' ', 1)) || '%'
  order by length(d.name) limit 1
), p.ord
from public.regions r
cross join lateral unnest(string_to_array(coalesce(r.pickup_points, ''), E'\n')) with ordinality as p(name, ord)
where trim(p.name) <> '' and not exists (select 1 from public.pickup_points x where x.region_id = r.id);

-- 3. Vehicles master + rate per place per vehicle
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                 -- "Sedan", "Innova / Ertiga", "Innova Crysta"
  seats int not null default 4,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
select public._crm_masters_rls('vehicles');
insert into public.vehicles (name, seats, sort) values ('Sedan', 4, 1), ('Innova / Ertiga', 6, 2), ('Innova Crysta', 7, 3)
on conflict (name) do nothing;

create table if not exists public.transfer_rates (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  rate numeric(12,2) not null default 0,       -- without AC
  ac_rate numeric(12,2) not null default 0,    -- with AC (0 = same as rate)
  created_at timestamptz not null default now(),
  unique (transfer_id, vehicle_id)
);
create index if not exists transfer_rates_vehicle_idx on public.transfer_rates(vehicle_id);
select public._crm_masters_rls('transfer_rates');

-- move the old 3 rate columns into the new table (once per place)
insert into public.transfer_rates (transfer_id, vehicle_id, rate)
select t.id, v.id, case v.name when 'Sedan' then coalesce(nullif(t.rate_sedan, 0), t.cost) when 'Innova / Ertiga' then t.rate_suv else t.rate_crysta end
from public.transfers t join public.vehicles v on v.name in ('Sedan', 'Innova / Ertiga', 'Innova Crysta')
where (case v.name when 'Sedan' then coalesce(nullif(t.rate_sedan, 0), t.cost) when 'Innova / Ertiga' then t.rate_suv else t.rate_crysta end) > 0
on conflict (transfer_id, vehicle_id) do nothing;

-- 4. Places (day plans): photos + night-stay options
alter table public.transfers add column if not exists images text[] not null default '{}';
alter table public.transfers add column if not exists stay_options uuid[] not null default '{}';  -- empty = to_destination only

-- 5. Hotels: photos + description (shown in "Images" / "Details" and on the package)
alter table public.hotels add column if not exists images text[] not null default '{}';
alter table public.hotels add column if not exists description text;

-- 6. Package (itinerary) fields like the portal form
alter table public.itineraries add column if not exists client_name text;
alter table public.itineraries add column if not exists adults_above10 int not null default 0;  -- extra-bed persons
alter table public.itineraries add column if not exists kids int not null default 0;            -- 5-10 yrs, no bed
alter table public.itineraries add column if not exists include_gst boolean not null default false;
alter table public.itineraries add column if not exists margin_amount numeric(12,2) not null default 0;
alter table public.itineraries add column if not exists agent_note text;
alter table public.itineraries add column if not exists admin_note text;
alter table public.itineraries add column if not exists confirmation_no text;
alter table public.itineraries add column if not exists pickup_point_id uuid references public.pickup_points(id) on delete set null;
alter table public.itineraries add column if not exists drop_point_id uuid references public.pickup_points(id) on delete set null;
alter table public.itineraries add column if not exists end_date date;

-- day rows carry the hotel choice
alter table public.itinerary_days add column if not exists hotel_category text;
alter table public.itinerary_days add column if not exists hotel_id uuid references public.hotels(id) on delete set null;
alter table public.itinerary_days add column if not exists room_type text;
create index if not exists itinerary_days_hotel_idx on public.itinerary_days(hotel_id);
create index if not exists itinerary_days_plan_idx on public.itinerary_days(day_plan_id);
create index if not exists itinerary_days_stay_idx on public.itinerary_days(stay_destination_id);

-- 7. Offers / discount / promotional lists
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'offer' check (kind in ('offer','discount','promotion')),
  region_group_id uuid references public.region_groups(id) on delete set null,
  title text not null,
  body text,
  image_url text,
  valid_till date,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists notices_group_idx on public.notices(region_group_id);
select public._crm_masters_rls('notices');

-- 8. Settings: contact numbers for customer care + theme + package validity
alter table public.settings add column if not exists phone2 text;
alter table public.settings add column if not exists whatsapp text;
alter table public.settings add column if not exists support_email text;
alter table public.settings add column if not exists sales_email text;
alter table public.settings add column if not exists theme text not null default 'blue';
alter table public.settings add column if not exists package_validity_days int not null default 15;
alter table public.settings add column if not exists default_margin_amount numeric(12,2) not null default 0;
alter table public.settings add column if not exists destination_note text;

update public.settings set itinerary_terms = E'Package Validity: Package cost is valid for 15 days from the date it is composed.\n\n## Information for our valued clients\n- Child below 5 years is complimentary.\n- Only post-paid mobile connections work in Jammu & Kashmir; prepaid roaming does not.\n- Reach the airport 3 hours before departure due to security checks.\n- If you are staying in a houseboat, call us before reaching so a shikara can be arranged for crossing.\n- Follow the hotel timings for breakfast & dinner.\n\n## Booking Policy\n- Every booking is subject to cancellation charges levied by the hotels, which vary by hotel and season.\n- We act as a booking agent and do not operate hotels of our own.\n- Advance payment is non-refundable in case of hotel cancellation by the client.\n\n## Cancellation & Amendment Policy\n- Cancellation charges may vary by date of cancellation as per hotel policy.\n- Reservations cancelled 16 days or more before arrival attract no cancellation fee.\n- Rooms are subject to availability at the time of confirmation and amendment.\n\n## Check-in Policy\n- Check-in 2:00 PM and check-out 12:00 noon, or as per hotel.\n- Hotels may charge a compulsory gala dinner supplement on Christmas / New Year / festive dates.\n- Breakfast and dinner timings as per hotel standards.\n\n## Payment Policy\n- 30% to 50% payment is required at the time of booking confirmation.\n- Balance amount to be paid on arrival / at check-in.\n- Payment terms may change in peak season as per hotel policy.'
where itinerary_terms is null or itinerary_terms like 'Rates are subject to availability%';

-- 9. Public bucket for hotel / place / region photos
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
drop policy if exists "crm media write" on storage.objects;
drop policy if exists "crm media update" on storage.objects;
drop policy if exists "crm media delete" on storage.objects;
create policy "crm media write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and ((select public.has_perm('masters','create')) or (select public.has_perm('masters','edit'))));
create policy "crm media update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select public.has_perm('masters','edit')));
create policy "crm media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select public.has_perm('masters','delete')));

notify pgrst, 'reload schema';

insert into public.lead_sources (name) values ('Group Query') on conflict (name) do nothing;

-- users can edit only their own name / phone (role & active flags stay admin-only)
create or replace function public.update_my_profile(p_name text, p_phone text) returns void
language sql security definer set search_path = public as $$
  update public.profiles set full_name = coalesce(nullif(trim(p_name), ''), full_name), phone = nullif(trim(p_phone), '') where id = auth.uid();
$$;
revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;

notify pgrst, 'reload schema';
