-- =====================================================================
-- A LINK CRM — complete database schema (Supabase / Postgres 15+)
-- Run this ONCE in Supabase → SQL Editor on a fresh project.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. ROLES, PROFILES, SETTINGS
-- ---------------------------------------------------------------------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_admin boolean not null default false,
  -- {"leads":["view","create","edit","delete","view_all"], ...}
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  role_id uuid references public.roles(id),
  is_active boolean not null default false,
  receives_leads boolean not null default true,     -- part of round-robin auto-assign
  last_assigned_at timestamptz,
  monthly_target numeric(14,2) not null default 0,  -- sales target (revenue)
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'A Link Tours & Travels',
  tagline text,
  logo_url text,
  address text,
  city text,
  state text default 'Madhya Pradesh',
  state_code text default '23',
  phone text,
  email text,
  website text,
  gstin text,
  pan text,
  bank_name text,
  bank_account_name text,
  bank_account_no text,
  bank_ifsc text,
  upi_id text,
  brand_color text not null default '#0f766e',
  currency text not null default 'INR',
  -- numbering
  lead_prefix text not null default 'LD',
  quote_prefix text not null default 'QT',
  booking_prefix text not null default 'BK',
  invoice_prefix text not null default 'INV',
  voucher_prefix text not null default 'VC',
  receipt_prefix text not null default 'RC',
  -- pricing / tax defaults
  default_markup_percent numeric(6,2) not null default 10,
  default_gst_percent numeric(5,2) not null default 5,
  gst_mode text not null default 'total' check (gst_mode in ('total','markup')),
  sac_code text not null default '998555',
  default_tcs_percent numeric(5,2) not null default 0,
  -- texts
  invoice_terms text default E'1. Payment once made is non-refundable except as per cancellation policy.\n2. Subject to local jurisdiction.',
  itinerary_terms text default E'Rates are subject to availability at the time of booking.\nHotel check-in 12:00 PM / check-out 11:00 AM.',
  voucher_notes text default 'Please carry a valid photo ID. Contact us 24x7 for any assistance.',
  -- automation
  auto_assign text not null default 'none' check (auto_assign in ('none','round_robin')),
  unattended_hours int not null default 24,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- secrets readable only by admins (webhook key for website / Google Sheet lead capture)
create table if not exists public.app_secrets (
  id int primary key default 1 check (id = 1),
  lead_webhook_key text not null default encode(gen_random_bytes(18),'hex'),
  cron_secret text not null default encode(gen_random_bytes(18),'hex')
);
insert into public.app_secrets (id) values (1) on conflict (id) do nothing;

-- running number per document type (+ financial year for invoices)
create table if not exists public.counters (
  kind text not null,
  period text not null default '',
  value int not null default 0,
  primary key (kind, period)
);

-- ---------------------------------------------------------------------
-- 2. MASTERS
-- ---------------------------------------------------------------------
create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'India',
  state text,
  description text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supplier_type text not null default 'hotel'
    check (supplier_type in ('hotel','transport','airline','activity','dmc','visa','insurance','other')),
  contact_person text,
  phone text,
  email text,
  gstin text,
  address text,
  city text,
  bank_details text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  destination_id uuid references public.destinations(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  category text default '3 Star',
  address text,
  phone text,
  email text,
  check_in_time text default '12:00 PM',
  check_out_time text default '11:00 AM',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.hotel_rates (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_type text not null default 'Deluxe',
  meal_plan text not null default 'CP' check (meal_plan in ('EP','CP','MAP','AP','AI')),
  season text,
  valid_from date,
  valid_to date,
  cost_per_night numeric(12,2) not null default 0,   -- per room per night (double occupancy)
  extra_adult numeric(12,2) not null default 0,
  child_with_bed numeric(12,2) not null default 0,
  child_without_bed numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  destination_id uuid references public.destinations(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  duration text,
  cost_adult numeric(12,2) not null default 0,
  cost_child numeric(12,2) not null default 0,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  name text not null,                                 -- e.g. "Srinagar Airport → Hotel"
  destination_id uuid references public.destinations(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  vehicle_type text default 'Sedan',
  capacity int not null default 4,
  cost numeric(12,2) not null default 0,              -- per vehicle
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.text_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'inclusion'
    check (category in ('inclusion','exclusion','terms','cancellation','notes','whatsapp','email')),
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. CRM: CONTACTS, LEADS, FOLLOW-UPS
-- ---------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  phone_norm text generated always as (right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10)) stored,
  alt_phone text,
  email text,
  city text,
  state text,
  address text,
  customer_type text not null default 'B2C' check (customer_type in ('B2C','B2B','Corporate')),
  segment text not null default 'New' ,             -- New / Regular / VIP / Corporate / Inactive (free text)
  tags text[] not null default '{}',
  dob date,
  anniversary date,
  gender text,
  passport_no text,
  passport_expiry date,
  gstin text,
  company_name text,
  pref_hotel_category text,
  pref_meal text,
  pref_budget text,
  pref_notes text,
  notes text,
  owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_phone_norm_idx on public.contacts(phone_norm);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_no text unique,
  contact_id uuid references public.contacts(id) on delete set null,
  name text not null,
  phone text,
  email text,
  city text,
  source text not null default 'Manual',
  campaign text,
  status text not null default 'new'
    check (status in ('new','contacted','qualified','quoted','negotiation','won','lost','on_hold')),
  priority text not null default 'warm' check (priority in ('hot','warm','cold')),
  destination text,
  travel_date date,
  return_date date,
  nights int,
  adults int not null default 2,
  children int not null default 0,
  infants int not null default 0,
  budget numeric(14,2),
  requirements text,
  lost_reason text,
  assigned_to uuid references public.profiles(id) on delete set null,
  external_id text unique,                           -- de-dupe key for Sheet / FB / website imports
  next_followup_at timestamptz,
  last_activity_at timestamptz,
  converted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_assigned_idx on public.leads(assigned_to);
create index if not exists leads_created_idx on public.leads(created_at desc);

create table if not exists public.lead_activities (       -- timeline: notes, status changes, calls
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note','status','call','whatsapp','email','meeting','system')),
  body text not null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists lead_activities_lead_idx on public.lead_activities(lead_id, created_at desc);

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  kind text not null default 'call' check (kind in ('call','meeting','task','whatsapp','email')),
  title text not null,
  notes text,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','done','cancelled')),
  outcome text,
  assigned_to uuid references public.profiles(id) on delete set null default auth.uid(),
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists followups_due_idx on public.followups(status, due_at);

-- Google Sheet (FB / Insta lead ads) integrations
create table if not exists public.lead_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sheet_url text not null,
  default_source text not null default 'Facebook',
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_result text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. ITINERARY / QUOTATION
-- ---------------------------------------------------------------------
create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  quote_no text unique,
  version int not null default 1,
  parent_id uuid references public.itineraries(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null default 'Tour Package',
  destination text,
  start_date date,
  nights int not null default 0,
  adults int not null default 2,
  children int not null default 0,
  infants int not null default 0,
  rooms int not null default 1,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected')),
  markup_type text not null default 'percent' check (markup_type in ('percent','fixed')),
  markup_value numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  gst_percent numeric(5,2) not null default 5,
  gst_mode text not null default 'total' check (gst_mode in ('total','markup')),
  tcs_percent numeric(5,2) not null default 0,
  cost_total numeric(14,2) not null default 0,
  markup_total numeric(14,2) not null default 0,
  gst_total numeric(14,2) not null default 0,
  tcs_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  show_item_prices boolean not null default false,
  overview text,
  inclusions text,
  exclusions text,
  terms text,
  cover_image text,
  valid_till date,
  share_token uuid not null default gen_random_uuid() unique,
  booking_id uuid,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.itinerary_days (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  day_no int not null,
  title text not null default '',
  description text,
  destination_id uuid references public.destinations(id) on delete set null,
  meals text,
  unique (itinerary_id, day_no)
);

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  day_no int,
  sort int not null default 0,
  item_type text not null check (item_type in ('hotel','activity','transfer','flight','train','visa','insurance','other')),
  ref_id uuid,                         -- hotel_rates.id / activities.id / transfers.id
  supplier_id uuid references public.suppliers(id) on delete set null,
  title text not null,
  details jsonb not null default '{}'::jsonb,   -- room_type, meal_plan, rooms, check_in, nights, flight no …
  qty numeric(10,2) not null default 1,
  unit_cost numeric(12,2) not null default 0,
  cost numeric(14,2) not null default 0,
  markup numeric(14,2),                -- optional per-item override (₹)
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. BOOKINGS (TRIPS) & SERVICES
-- ---------------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_no text unique,
  lead_id uuid references public.leads(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  itinerary_id uuid references public.itineraries(id) on delete set null,
  title text not null,
  destination text,
  start_date date,
  end_date date,
  adults int not null default 2,
  children int not null default 0,
  infants int not null default 0,
  status text not null default 'confirmed' check (status in ('confirmed','ongoing','completed','cancelled')),
  sell_amount numeric(14,2) not null default 0,       -- package price to customer (incl. tax)
  tax_amount numeric(14,2) not null default 0,        -- GST + TCS included in sell_amount
  cost_amount numeric(14,2) not null default 0,       -- auto = sum of services cost
  notes text,
  handled_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bookings add column if not exists tax_amount numeric(14,2) not null default 0;
alter table public.itineraries drop constraint if exists itineraries_booking_fk;
alter table public.itineraries add constraint itineraries_booking_fk foreign key (booking_id) references public.bookings(id) on delete set null;

create table if not exists public.booking_services (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  service_type text not null check (service_type in ('hotel','flight','cab','tour','train','visa','insurance','other')),
  supplier_id uuid references public.suppliers(id) on delete set null,
  title text not null,
  details jsonb not null default '{}'::jsonb,   -- hotel: room_type, meal_plan, rooms; flight: airline, flight_no, pnr, from, to …
  start_date date,
  end_date date,
  confirmation_no text,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  cost numeric(14,2) not null default 0,
  sell numeric(14,2) not null default 0,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. INVOICES, PAYMENTS, EXPENSES, VOUCHERS, DOCUMENTS
-- ---------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text unique,
  booking_id uuid references public.bookings(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  bill_to_name text not null,
  bill_to_address text,
  bill_to_gstin text,
  bill_to_phone text,
  bill_to_email text,
  place_of_supply text,
  invoice_date date not null default current_date,
  due_date date,
  tax_type text not null default 'cgst_sgst' check (tax_type in ('cgst_sgst','igst','none')),
  gst_percent numeric(5,2) not null default 5,
  gst_mode text not null default 'total' check (gst_mode in ('total','markup')),
  service_charge numeric(14,2) not null default 0,  -- used when gst_mode = markup (GST only on this)
  tcs_percent numeric(5,2) not null default 0,
  discount numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  taxable_value numeric(14,2) not null default 0,
  cgst numeric(14,2) not null default 0,
  sgst numeric(14,2) not null default 0,
  igst numeric(14,2) not null default 0,
  tcs numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  status text not null default 'unpaid' check (status in ('draft','unpaid','partial','paid','cancelled')),
  notes text,
  terms text,
  share_token uuid not null default gen_random_uuid() unique,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  sac text,
  qty numeric(10,2) not null default 1,
  rate numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  sort int not null default 0
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_no text unique,
  direction text not null default 'in' check (direction in ('in','out')),   -- in = customer receipt, out = supplier payment
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  mode text not null default 'UPI' check (mode in ('Cash','UPI','Bank Transfer','Card','Cheque','Payment Link','Other')),
  reference text,
  contact_id uuid references public.contacts(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists payments_date_idx on public.payments(payment_date);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null default 'Office',
  amount numeric(14,2) not null check (amount > 0),
  paid_to text,
  mode text default 'UPI',
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_no text unique,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  voucher_type text not null check (voucher_type in ('hotel','flight','cab','tour','combined')),
  service_ids uuid[] not null default '{}',
  data jsonb not null default '{}'::jsonb,       -- snapshot (guest, pax, services) at time of issue
  notes text,
  share_token uuid not null default gen_random_uuid() unique,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  doc_type text not null default 'other' check (doc_type in ('passport','visa','id_proof','ticket','voucher','invoice','photo','other')),
  file_path text not null,           -- path inside storage bucket "documents"
  file_size bigint,
  mime_type text,
  expiry_date date,
  contact_id uuid references public.contacts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_name text,
  action text not null,           -- insert / update / delete
  entity text not null,           -- table name
  entity_id text,
  label text,
  changes text[],
  created_at timestamptz not null default now()
);
create index if not exists activity_log_created_idx on public.activity_log(created_at desc);

-- ---------------------------------------------------------------------
-- 7. HELPER FUNCTIONS
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.is_admin from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and p.is_active), false);
$$;

create or replace function public.has_perm(module text, action text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.is_admin or coalesce(r.permissions -> module ? action, false)
    from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and p.is_active), false);
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

-- next number: LD-0001, QT-0001, INV/26-27/0001 …
create or replace function public.next_doc_no(p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  v_period text := '';
  v_val int;
  v_prefix text;
  fy_start int;
begin
  select * into s from public.settings where id = 1;
  if p_kind in ('invoice','receipt','payment') then
    fy_start := case when extract(month from current_date) >= 4 then extract(year from current_date)::int
                     else extract(year from current_date)::int - 1 end;
    v_period := lpad((fy_start % 100)::text, 2, '0') || '-' || lpad(((fy_start + 1) % 100)::text, 2, '0');
  end if;
  insert into public.counters(kind, period, value) values (p_kind, v_period, 1)
    on conflict (kind, period) do update set value = public.counters.value + 1
    returning value into v_val;
  v_prefix := case p_kind
    when 'lead' then s.lead_prefix when 'quote' then s.quote_prefix
    when 'booking' then s.booking_prefix when 'invoice' then s.invoice_prefix
    when 'voucher' then s.voucher_prefix when 'receipt' then s.receipt_prefix
    when 'payment' then 'PV' else upper(p_kind) end;
  if v_period <> '' then
    return v_prefix || '/' || v_period || '/' || lpad(v_val::text, 4, '0');
  end if;
  return v_prefix || '-' || lpad(v_val::text, 4, '0');
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 8. TRIGGERS
-- ---------------------------------------------------------------------

-- new auth user → profile (first user becomes active Admin)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_first boolean;
  v_role uuid;
begin
  select not exists (select 1 from public.profiles) into v_first;
  if v_first then
    select id into v_role from public.roles where is_admin order by created_at limit 1;
  else
    select id into v_role from public.roles where name = 'Sales Executive' limit 1;
  end if;
  insert into public.profiles (id, full_name, email, phone, role_id, is_active)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
          new.email,
          new.raw_user_meta_data->>'phone',
          v_role,
          v_first)                      -- everyone else is activated by the admin
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- leads: number, contact auto link/create, auto-assign
create or replace function public.leads_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_contact uuid;
  v_norm text := right(regexp_replace(coalesce(new.phone,''), '\D', '', 'g'), 10);
  s public.settings;
  v_user uuid;
begin
  if new.lead_no is null then new.lead_no := public.next_doc_no('lead'); end if;

  if new.contact_id is null and length(v_norm) >= 10 then
    select id into v_contact from public.contacts where phone_norm = v_norm order by created_at limit 1;
    if v_contact is null then
      insert into public.contacts (name, phone, email, city, created_by)
      values (new.name, new.phone, new.email, new.city, new.created_by) returning id into v_contact;
    end if;
    new.contact_id := v_contact;
  elsif new.contact_id is null then
    insert into public.contacts (name, phone, email, city, created_by)
    values (new.name, new.phone, new.email, new.city, new.created_by) returning id into new.contact_id;
  end if;

  if new.assigned_to is null then
    select * into s from public.settings where id = 1;
    if s.auto_assign = 'round_robin' then
      select id into v_user from public.profiles
        where is_active and receives_leads
        order by last_assigned_at nulls first, created_at limit 1
        for update skip locked;
      if v_user is not null then
        new.assigned_to := v_user;
        update public.profiles set last_assigned_at = now() where id = v_user;
      end if;
    else
      new.assigned_to := coalesce(new.created_by, auth.uid());
    end if;
  end if;

  new.last_activity_at := now();
  return new;
end $$;
drop trigger if exists leads_bi on public.leads;
create trigger leads_bi before insert on public.leads for each row execute function public.leads_before_insert();

create or replace function public.leads_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.last_activity_at := now();
    if new.status = 'won' and old.status <> 'won' then new.converted_at := now(); end if;
    insert into public.lead_activities (lead_id, kind, body, created_by)
    values (new.id, 'status', 'Status changed: ' || old.status || ' → ' || new.status
            || case when new.status = 'lost' and new.lost_reason is not null then ' (' || new.lost_reason || ')' else '' end,
            auth.uid());
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.lead_activities (lead_id, kind, body, created_by)
    values (new.id, 'system', 'Lead re-assigned to ' ||
            coalesce((select full_name from public.profiles where id = new.assigned_to), 'nobody'), auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists leads_bu on public.leads;
create trigger leads_bu before update on public.leads for each row execute function public.leads_before_update();

create or replace function public.lead_activity_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.leads set last_activity_at = now(),
    status = case when status = 'new' and new.kind in ('call','whatsapp','email','meeting') then 'contacted' else status end
  where id = new.lead_id;
  return new;
end $$;
drop trigger if exists lead_activities_ai on public.lead_activities;
create trigger lead_activities_ai after insert on public.lead_activities
  for each row when (new.kind <> 'status' and new.kind <> 'system') execute function public.lead_activity_touch();

-- follow-ups keep leads.next_followup_at in sync + log completion
create or replace function public.followups_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lead uuid := coalesce(new.lead_id, old.lead_id);
begin
  if tg_op = 'UPDATE' and new.status = 'done' and old.status <> 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end $$;
drop trigger if exists followups_bu on public.followups;
create trigger followups_bu before update on public.followups for each row execute function public.followups_sync();

create or replace function public.followups_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_lead uuid := coalesce(new.lead_id, old.lead_id);
begin
  if v_lead is not null then
    update public.leads set next_followup_at = (
      select min(due_at) from public.followups where lead_id = v_lead and status = 'pending')
    where id = v_lead;
    if tg_op = 'UPDATE' and new.status = 'done' and old.status <> 'done' then
      insert into public.lead_activities (lead_id, kind, body, created_by)
      values (v_lead, case when new.kind in ('call','whatsapp','email','meeting') then new.kind else 'note' end,
              'Follow-up done: ' || new.title || coalesce(' — ' || nullif(new.outcome, ''), ''), auth.uid());
    end if;
  end if;
  return null;
end $$;
drop trigger if exists followups_aiud on public.followups;
create trigger followups_aiud after insert or update or delete on public.followups
  for each row execute function public.followups_after();

-- numbering triggers
create or replace function public.set_doc_no() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'itineraries' then
    if new.quote_no is null then new.quote_no := public.next_doc_no('quote'); end if;
  elsif tg_table_name = 'bookings' then
    if new.booking_no is null then new.booking_no := public.next_doc_no('booking'); end if;
  elsif tg_table_name = 'invoices' then
    if new.invoice_no is null then new.invoice_no := public.next_doc_no('invoice'); end if;
  elsif tg_table_name = 'vouchers' then
    if new.voucher_no is null then new.voucher_no := public.next_doc_no('voucher'); end if;
  elsif tg_table_name = 'payments' then
    if new.payment_no is null then
      new.payment_no := public.next_doc_no(case when new.direction = 'in' then 'receipt' else 'payment' end);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists itineraries_no on public.itineraries;
create trigger itineraries_no before insert on public.itineraries for each row execute function public.set_doc_no();
drop trigger if exists bookings_no on public.bookings;
create trigger bookings_no before insert on public.bookings for each row execute function public.set_doc_no();
drop trigger if exists invoices_no on public.invoices;
create trigger invoices_no before insert on public.invoices for each row execute function public.set_doc_no();
drop trigger if exists vouchers_no on public.vouchers;
create trigger vouchers_no before insert on public.vouchers for each row execute function public.set_doc_no();
drop trigger if exists payments_no on public.payments;
create trigger payments_no before insert on public.payments for each row execute function public.set_doc_no();

-- updated_at
drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();
drop trigger if exists itineraries_touch on public.itineraries;
create trigger itineraries_touch before update on public.itineraries for each row execute function public.touch_updated_at();
drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();
drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices for each row execute function public.touch_updated_at();

-- booking cost = sum of services
create or replace function public.booking_cost_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_b uuid := coalesce(new.booking_id, old.booking_id);
begin
  update public.bookings set cost_amount = coalesce((
    select sum(cost) from public.booking_services where booking_id = v_b and status <> 'cancelled'), 0)
  where id = v_b;
  return null;
end $$;
drop trigger if exists booking_services_cost on public.booking_services;
create trigger booking_services_cost after insert or update or delete on public.booking_services
  for each row execute function public.booking_cost_sync();

-- invoice paid amount / status from payments
create or replace function public.invoice_paid_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  v_ids := array_remove(array[
    case when tg_op <> 'INSERT' then old.invoice_id end,
    case when tg_op <> 'DELETE' then new.invoice_id end], null);
  update public.invoices i set
    amount_paid = coalesce((select sum(amount) from public.payments p where p.invoice_id = i.id and p.direction = 'in'), 0)
  where i.id = any(v_ids);
  update public.invoices set status = case
      when status in ('draft','cancelled') then status
      when amount_paid >= total and total > 0 then 'paid'
      when amount_paid > 0 then 'partial'
      else 'unpaid' end
  where id = any(v_ids);
  return null;
end $$;
drop trigger if exists payments_invoice_sync on public.payments;
create trigger payments_invoice_sync after insert or update or delete on public.payments
  for each row execute function public.invoice_paid_sync();

create or replace function public.invoice_status_sync() returns trigger language plpgsql as $$
begin
  if new.status not in ('draft','cancelled') then
    new.status := case when new.amount_paid >= new.total and new.total > 0 then 'paid'
                       when new.amount_paid > 0 then 'partial' else 'unpaid' end;
  end if;
  return new;
end $$;
drop trigger if exists invoices_status on public.invoices;
create trigger invoices_status before insert or update of total, amount_paid, status on public.invoices
  for each row execute function public.invoice_status_sync();

-- generic audit trail
create or replace function public.log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  o jsonb;
  v_label text;
  v_changes text[];
begin
  r := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_label := coalesce(r->>'lead_no', r->>'quote_no', r->>'booking_no', r->>'invoice_no', r->>'voucher_no', r->>'payment_no', '')
             || case when coalesce(r->>'name', r->>'title', r->>'bill_to_name', r->>'full_name') is not null
                     then ' ' || coalesce(r->>'name', r->>'title', r->>'bill_to_name', r->>'full_name') else '' end;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    select array_agg(key) into v_changes from jsonb_each(r) e
      where e.value is distinct from o->e.key and key not in ('updated_at','last_activity_at','next_followup_at','amount_paid','cost_amount','last_assigned_at','status_changed');
    if v_changes is null then return null; end if;
  end if;
  insert into public.activity_log (actor_id, actor_name, action, entity, entity_id, label, changes)
  values (auth.uid(), (select full_name from public.profiles where id = auth.uid()),
          lower(tg_op), tg_table_name, r->>'id', trim(v_label), v_changes);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['leads','contacts','followups','itineraries','bookings','booking_services','invoices',
                           'payments','expenses','vouchers','documents','hotels','hotel_rates','suppliers','activities',
                           'transfers','destinations','settings','roles','profiles'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_activity()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9. VIEWS (security_invoker → RLS of the caller applies)
-- ---------------------------------------------------------------------
drop view if exists public.booking_summary;
create view public.booking_summary with (security_invoker = true) as
select b.*,
  c.name as contact_name, c.phone as contact_phone,
  coalesce((select sum(amount) from public.payments p where p.booking_id = b.id and p.direction = 'in'), 0) as received,
  coalesce((select sum(amount) from public.payments p where p.booking_id = b.id and p.direction = 'out'), 0) as paid_to_suppliers,
  b.sell_amount - coalesce((select sum(amount) from public.payments p where p.booking_id = b.id and p.direction = 'in'), 0) as balance_due,
  b.sell_amount - b.tax_amount - b.cost_amount as profit
from public.bookings b
left join public.contacts c on c.id = b.contact_id;

-- ---------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
do $$
declare
  rec record;
begin
  -- table → permission module
  for rec in select * from (values
    ('contacts','contacts'), ('lead_activities','leads'), ('lead_integrations','leads'),
    ('itineraries','itineraries'), ('itinerary_days','itineraries'), ('itinerary_items','itineraries'),
    ('bookings','bookings'), ('booking_services','bookings'),
    ('invoices','invoices'), ('invoice_items','invoices'),
    ('payments','payments'), ('expenses','payments'),
    ('vouchers','vouchers'), ('documents','contacts'),
    ('destinations','masters'), ('suppliers','masters'), ('hotels','masters'), ('hotel_rates','masters'),
    ('activities','masters'), ('transfers','masters'), ('text_templates','masters'), ('lead_sources','masters')
  ) as x(tbl, module) loop
    execute format('alter table public.%I enable row level security', rec.tbl);
    execute format('drop policy if exists %I on public.%I', rec.tbl || '_sel', rec.tbl);
    execute format('drop policy if exists %I on public.%I', rec.tbl || '_ins', rec.tbl);
    execute format('drop policy if exists %I on public.%I', rec.tbl || '_upd', rec.tbl);
    execute format('drop policy if exists %I on public.%I', rec.tbl || '_del', rec.tbl);
    if rec.module = 'masters' then
      -- every active user can READ masters (needed for the itinerary builder)
      execute format('create policy %I on public.%I for select to authenticated using ((select public.is_active_user()))', rec.tbl || '_sel', rec.tbl);
    elsif rec.tbl = 'lead_activities' then
      execute format('create policy %I on public.%I for select to authenticated using ((select public.has_perm(''leads'',''view'')))', rec.tbl || '_sel', rec.tbl);
    else
      execute format('create policy %I on public.%I for select to authenticated using ((select public.has_perm(%L,''view'')))', rec.tbl || '_sel', rec.tbl, rec.module);
    end if;
    if rec.tbl = 'lead_activities' then
      execute format('create policy %I on public.%I for insert to authenticated with check ((select public.has_perm(''leads'',''view'')))', rec.tbl || '_ins', rec.tbl);
    elsif rec.tbl in ('itinerary_days','itinerary_items','booking_services','invoice_items') then
      -- child rows: editing the parent = full control of children
      execute format('create policy %I on public.%I for insert to authenticated with check ((select public.has_perm(%L,''edit'')) or (select public.has_perm(%L,''create'')))', rec.tbl || '_ins', rec.tbl, rec.module, rec.module);
    else
      execute format('create policy %I on public.%I for insert to authenticated with check ((select public.has_perm(%L,''create'')))', rec.tbl || '_ins', rec.tbl, rec.module);
    end if;
    if rec.tbl in ('itinerary_days','itinerary_items','booking_services','invoice_items') then
      execute format('create policy %I on public.%I for update to authenticated using ((select public.has_perm(%L,''edit'')) or (select public.has_perm(%L,''create'')))', rec.tbl || '_upd', rec.tbl, rec.module, rec.module);
      execute format('create policy %I on public.%I for delete to authenticated using ((select public.has_perm(%L,''edit'')) or (select public.has_perm(%L,''create'')))', rec.tbl || '_del', rec.tbl, rec.module, rec.module);
    else
      execute format('create policy %I on public.%I for update to authenticated using ((select public.has_perm(%L,''edit'')))', rec.tbl || '_upd', rec.tbl, rec.module);
      execute format('create policy %I on public.%I for delete to authenticated using ((select public.has_perm(%L,''delete'')))', rec.tbl || '_del', rec.tbl, rec.module);
    end if;
  end loop;
end $$;

-- leads: own leads unless view_all
alter table public.leads enable row level security;
drop policy if exists leads_sel on public.leads;
drop policy if exists leads_ins on public.leads;
drop policy if exists leads_upd on public.leads;
drop policy if exists leads_del on public.leads;
create policy leads_sel on public.leads for select to authenticated using (
  (select public.has_perm('leads','view')) and ((select public.has_perm('leads','view_all')) or assigned_to = (select auth.uid()) or created_by = (select auth.uid())));
create policy leads_ins on public.leads for insert to authenticated with check ((select public.has_perm('leads','create')));
create policy leads_upd on public.leads for update to authenticated using (
  (select public.has_perm('leads','edit')) and ((select public.has_perm('leads','view_all')) or assigned_to = (select auth.uid()) or created_by = (select auth.uid())));
create policy leads_del on public.leads for delete to authenticated using ((select public.has_perm('leads','delete')));

-- follow-ups: own unless view_all
alter table public.followups enable row level security;
drop policy if exists followups_sel on public.followups;
drop policy if exists followups_ins on public.followups;
drop policy if exists followups_upd on public.followups;
drop policy if exists followups_del on public.followups;
create policy followups_sel on public.followups for select to authenticated using (
  (select public.has_perm('followups','view')) and ((select public.has_perm('followups','view_all')) or assigned_to = (select auth.uid()) or created_by = (select auth.uid())));
create policy followups_ins on public.followups for insert to authenticated with check ((select public.has_perm('followups','create')));
create policy followups_upd on public.followups for update to authenticated using (
  (select public.has_perm('followups','edit')) or assigned_to = (select auth.uid()));
create policy followups_del on public.followups for delete to authenticated using ((select public.has_perm('followups','delete')));

-- profiles / roles / settings
alter table public.profiles enable row level security;
drop policy if exists profiles_sel on public.profiles;
create policy profiles_sel on public.profiles for select to authenticated using (true);
-- no insert/update/delete policies: changed only through /api/team (service role)

alter table public.roles enable row level security;
drop policy if exists roles_sel on public.roles;
drop policy if exists roles_all on public.roles;
drop policy if exists roles_ins on public.roles;
drop policy if exists roles_upd on public.roles;
drop policy if exists roles_del on public.roles;
create policy roles_sel on public.roles for select to authenticated using (true);
create policy roles_ins on public.roles for insert to authenticated with check ((select public.is_admin()));
create policy roles_upd on public.roles for update to authenticated using ((select public.is_admin()));
create policy roles_del on public.roles for delete to authenticated using ((select public.is_admin()));

alter table public.settings enable row level security;
drop policy if exists settings_sel on public.settings;
drop policy if exists settings_upd on public.settings;
create policy settings_sel on public.settings for select to authenticated using ((select public.is_active_user()));
create policy settings_upd on public.settings for update to authenticated using ((select public.has_perm('settings','edit')));

alter table public.counters enable row level security;      -- only security-definer functions touch it

alter table public.activity_log enable row level security;
drop policy if exists activity_log_sel on public.activity_log;
create policy activity_log_sel on public.activity_log for select to authenticated using ((select public.has_perm('team','view')));

alter table public.app_secrets enable row level security;
drop policy if exists app_secrets_admin on public.app_secrets;
create policy app_secrets_admin on public.app_secrets for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- 11. STORAGE (documents + logos)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('branding', 'branding', true) on conflict (id) do nothing;

drop policy if exists "crm docs read" on storage.objects;
drop policy if exists "crm docs write" on storage.objects;
drop policy if exists "crm docs delete" on storage.objects;
drop policy if exists "crm branding write" on storage.objects;
drop policy if exists "crm branding update" on storage.objects;
create policy "crm docs read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select public.has_perm('contacts','view')));
create policy "crm docs write" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select public.is_active_user()));
create policy "crm docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (select public.has_perm('contacts','delete')));
create policy "crm branding write" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and (select public.has_perm('settings','edit')));
create policy "crm branding update" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and (select public.has_perm('settings','edit')));

-- ---------------------------------------------------------------------
-- 12. SEED DATA (roles, sources, templates)
-- ---------------------------------------------------------------------
insert into public.roles (name, description, is_admin, permissions) values
('Admin', 'Full access to everything', true, '{}'),
('Manager', 'All CRM + operations + accounts, no team/settings', false, '{
  "dashboard":["view"],
  "leads":["view","create","edit","delete","view_all","import"],
  "followups":["view","create","edit","delete","view_all"],
  "contacts":["view","create","edit","delete"],
  "itineraries":["view","create","edit","delete"],
  "bookings":["view","create","edit","delete"],
  "invoices":["view","create","edit","delete"],
  "payments":["view","create","edit","delete"],
  "vouchers":["view","create","edit","delete"],
  "reports":["view"],
  "masters":["view","create","edit","delete"],
  "team":["view"]}'),
('Sales Executive', 'Own leads, follow-ups, quotations', false, '{
  "dashboard":["view"],
  "leads":["view","create","edit"],
  "followups":["view","create","edit"],
  "contacts":["view","create","edit"],
  "itineraries":["view","create","edit"],
  "bookings":["view"],
  "masters":["view"]}'),
('Operations', 'Bookings, vouchers, suppliers', false, '{
  "dashboard":["view"],
  "leads":["view","view_all"],
  "followups":["view","create","edit"],
  "contacts":["view","create","edit"],
  "itineraries":["view","create","edit"],
  "bookings":["view","create","edit"],
  "vouchers":["view","create","edit"],
  "payments":["view","create"],
  "masters":["view","create","edit"]}'),
('Accounts', 'Invoices, payments, reports', false, '{
  "dashboard":["view"],
  "contacts":["view"],
  "bookings":["view"],
  "invoices":["view","create","edit","delete"],
  "payments":["view","create","edit","delete"],
  "vouchers":["view"],
  "reports":["view"]}')
on conflict (name) do nothing;

insert into public.lead_sources (name) values
('Manual'),('Website'),('Facebook'),('Instagram'),('Google Ads'),('WhatsApp'),('Phone Call'),
('Walk-in'),('Referral'),('Repeat Customer'),('Excel Import'),('B2B Agent')
on conflict (name) do nothing;

insert into public.text_templates (category, title, body)
select * from (values
 ('inclusion','Standard inclusions', E'Accommodation on twin sharing basis\nDaily breakfast\nAll transfers & sightseeing by private vehicle\nDriver allowance, toll, parking & fuel\nAll applicable hotel taxes'),
 ('exclusion','Standard exclusions', E'Airfare / train fare\nLunch & dinner unless mentioned\nEntry tickets & monument fees\nPersonal expenses (laundry, phone, tips)\nAnything not mentioned in inclusions'),
 ('cancellation','Cancellation policy', E'30+ days before travel: 10% of package cost\n15–29 days: 25%\n7–14 days: 50%\nLess than 7 days / no show: 100%'),
 ('whatsapp','Quotation message', 'Hi {name}, greetings from {company}! Here is your trip plan for {destination}: {link}. Let us know if you would like any changes.'),
 ('whatsapp','Payment reminder', 'Hi {name}, a gentle reminder that ₹{amount} is pending for your booking {booking}. Pay here: {link}. Thank you!'),
 ('whatsapp','Follow-up', 'Hi {name}, this is {user} from {company}. Just checking if you had a chance to look at the {destination} plan?'),
 ('email','Quotation email', E'Dear {name},\n\nThank you for your enquiry. Please find your personalised itinerary for {destination} here:\n{link}\n\nRegards,\n{user}\n{company}')
) as v(category, title, body)
where not exists (select 1 from public.text_templates);

-- grants (Supabase gives these by default; kept explicit for clarity)
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
