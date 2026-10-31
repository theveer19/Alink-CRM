-- =====================================================================
-- A LINK CRM — 004 regions / packages (Kashmir, Leh-Ladakh, Thailand …)
-- Every itinerary starts by choosing a region; cities, day plans, hotels,
-- pickup points and inclusions are then filtered to that region.
-- Run after 003. Safe to re-run.
-- =====================================================================

create table if not exists public.regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                 -- "Kashmir", "Leh Ladakh", "Thailand"
  country text not null default 'India',
  pickup_points text,                        -- one per line: "Srinagar Airport", "Jammu Tawi Railway Station"
  description text,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.regions enable row level security;
drop policy if exists regions_sel on public.regions;
drop policy if exists regions_ins on public.regions;
drop policy if exists regions_upd on public.regions;
drop policy if exists regions_del on public.regions;
create policy regions_sel on public.regions for select to authenticated using ((select public.is_active_user()));
create policy regions_ins on public.regions for insert to authenticated with check ((select public.has_perm('masters','create')));
create policy regions_upd on public.regions for update to authenticated using ((select public.has_perm('masters','edit')));
create policy regions_del on public.regions for delete to authenticated using ((select public.has_perm('masters','delete')));
grant all on public.regions to authenticated, service_role;
drop trigger if exists regions_audit on public.regions;
create trigger regions_audit after insert or update or delete on public.regions for each row execute function public.log_activity();

-- cities belong to a region
alter table public.destinations add column if not exists region_id uuid references public.regions(id) on delete set null;
create index if not exists destinations_region_idx on public.destinations(region_id);

-- inclusions / exclusions can be for a whole region
alter table public.inclusion_items add column if not exists region_id uuid references public.regions(id) on delete cascade;
create index if not exists inclusion_items_region_idx on public.inclusion_items(region_id);

-- itinerary: region + package-calculator style trip fields
alter table public.itineraries add column if not exists region_id uuid references public.regions(id) on delete set null;
alter table public.itineraries add column if not exists meal_plan text not null default 'MAP';
alter table public.itineraries add column if not exists extra_beds int not null default 0;
alter table public.itineraries add column if not exists child_no_bed int not null default 0;
-- several vehicles: [{"type":"suv","count":1,"ac":false}, …]
alter table public.itineraries add column if not exists vehicle_list jsonb not null default '[]'::jsonb;
create index if not exists itineraries_region_idx on public.itineraries(region_id);

-- starter regions (only when the table is empty)
insert into public.regions (name, country, pickup_points, sort)
select * from (values
  ('Kashmir', 'India', E'Srinagar Airport\nJammu Tawi Railway Station\nJammu Airport', 1),
  ('Leh Ladakh', 'India', E'Leh Airport\nLeh Bus Stand', 2),
  ('Himachal', 'India', E'Chandigarh Airport\nDelhi\nKullu (Bhuntar) Airport', 3)
) as v(name, country, pickup_points, sort)
where not exists (select 1 from public.regions);

-- link well-known cities that are already in Masters to their region
update public.destinations d set region_id = r.id
from public.regions r
where d.region_id is null and (
  (r.name = 'Kashmir' and d.name ~* '^(srinagar|gulmarg|pahalgam|sonamarg|doodhpathri|yousmarg|gurez|kokernag|jammu|katra|patnitop)')
  or (r.name = 'Leh Ladakh' and d.name ~* '^(leh|nubra|pangong|hunder|turtuk|kargil|tso moriri|hanle|sham)')
  or (r.name = 'Himachal' and d.name ~* '^(shimla|manali|kullu|dharamshala|dalhousie|kasol|spiti|kufri|chail)')
);

notify pgrst, 'reload schema';
