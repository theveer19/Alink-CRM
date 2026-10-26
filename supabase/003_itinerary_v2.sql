-- =====================================================================
-- A LINK CRM — 003 itinerary v2
-- Day plans (transfers / sightseeing with Sedan / SUV / Tempo rates),
-- night-stay based hotels, pickup / drop, inclusion & exclusion master.
-- Run after 001 and 002. Safe to re-run.
-- =====================================================================

-- 1. Transfers become "day plans": route + day description + rate per vehicle type
alter table public.transfers add column if not exists transfer_type text not null default 'sightseeing';
alter table public.transfers add column if not exists to_destination_id uuid references public.destinations(id) on delete set null;
alter table public.transfers add column if not exists rate_sedan numeric(12,2) not null default 0;
alter table public.transfers add column if not exists rate_suv numeric(12,2) not null default 0;
alter table public.transfers add column if not exists rate_tempo numeric(12,2) not null default 0;
alter table public.transfers add column if not exists sort int not null default 0;
alter table public.transfers drop constraint if exists transfers_type_check;
alter table public.transfers add constraint transfers_type_check
  check (transfer_type in ('arrival','departure','sightseeing','intercity','local','leisure'));
create index if not exists transfers_destination_idx on public.transfers(destination_id);
create index if not exists transfers_to_destination_idx on public.transfers(to_destination_id);

-- 2. Inclusion / exclusion master (checkbox list in the itinerary; optional paid add-ons)
create table if not exists public.inclusion_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'inclusion' check (kind in ('inclusion','exclusion')),
  title text not null,
  destination_id uuid references public.destinations(id) on delete cascade,  -- null = every trip
  is_default boolean not null default false,                                  -- pre-ticked on new itineraries
  cost_adult numeric(12,2) not null default 0,                                -- > 0 = paid add-on, added to the quote when ticked
  cost_child numeric(12,2) not null default 0,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists inclusion_items_destination_idx on public.inclusion_items(destination_id);

alter table public.inclusion_items enable row level security;
drop policy if exists inclusion_items_sel on public.inclusion_items;
drop policy if exists inclusion_items_ins on public.inclusion_items;
drop policy if exists inclusion_items_upd on public.inclusion_items;
drop policy if exists inclusion_items_del on public.inclusion_items;
create policy inclusion_items_sel on public.inclusion_items for select to authenticated using ((select public.is_active_user()));
create policy inclusion_items_ins on public.inclusion_items for insert to authenticated with check ((select public.has_perm('masters','create')));
create policy inclusion_items_upd on public.inclusion_items for update to authenticated using ((select public.has_perm('masters','edit')));
create policy inclusion_items_del on public.inclusion_items for delete to authenticated using ((select public.has_perm('masters','delete')));
grant all on public.inclusion_items to authenticated, service_role;

drop trigger if exists inclusion_items_audit on public.inclusion_items;
create trigger inclusion_items_audit after insert or update or delete on public.inclusion_items
  for each row execute function public.log_activity();

-- 3. Itinerary trip fields
alter table public.itineraries add column if not exists vehicle_type text not null default 'sedan';
alter table public.itineraries add column if not exists vehicles int not null default 1;
alter table public.itineraries add column if not exists pickup_point text;
alter table public.itineraries add column if not exists pickup_time text;
alter table public.itineraries add column if not exists arrival_details text;    -- flight / train no.
alter table public.itineraries add column if not exists drop_point text;
alter table public.itineraries add column if not exists drop_time text;
alter table public.itineraries add column if not exists departure_details text;
alter table public.itineraries drop constraint if exists itineraries_vehicle_check;
alter table public.itineraries add constraint itineraries_vehicle_check check (vehicle_type in ('sedan','suv','tempo','none'));

-- 4. Day fields: which day plan, and where the night is spent
alter table public.itinerary_days add column if not exists day_plan_id uuid references public.transfers(id) on delete set null;
alter table public.itinerary_days add column if not exists stay_destination_id uuid references public.destinations(id) on delete set null;

-- 5. Seed a few common inclusions / exclusions (only if the master is empty)
insert into public.inclusion_items (kind, title, is_default, sort)
select * from (values
  ('inclusion','Accommodation on twin sharing basis', true, 1),
  ('inclusion','Daily breakfast & dinner (MAP)', true, 2),
  ('inclusion','Assistance upon arrival at airport', true, 3),
  ('inclusion','All transfers & sightseeing by private vehicle', true, 4),
  ('inclusion','Driver allowance, toll, parking, driver''s night halt, fuel charges', true, 5),
  ('inclusion','Welcome drink on arrival', false, 6),
  ('exclusion','Airfare / train fare', true, 1),
  ('exclusion','Expenses of personal nature such as tips, laundry, telephone & table drinks', true, 2),
  ('exclusion','Entry tickets, monument fees and activity charges unless mentioned', true, 3),
  ('exclusion','Any other cab required for local shopping or places not mentioned in the itinerary', true, 4),
  ('exclusion','Any other services not specified above in inclusions', true, 5),
  ('exclusion','Please note that AC will be switched off during hills', false, 6)
) as v(kind, title, is_default, sort)
where not exists (select 1 from public.inclusion_items);

-- 6. Make sure the API can see the new columns right away
notify pgrst, 'reload schema';
