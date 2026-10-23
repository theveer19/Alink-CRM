-- =====================================================================
-- A LINK CRM — 002 hardening (security + performance advisor fixes)
-- Run after 001_schema.sql. Safe to re-run.
-- =====================================================================

-- 1. Functions: nobody calls these over the API. Triggers still fire normally.
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.next_doc_no(text) from authenticated;   -- stops anyone burning invoice numbers
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.leads_before_insert() from authenticated;
revoke execute on function public.leads_before_update() from authenticated;
revoke execute on function public.lead_activity_touch() from authenticated;
revoke execute on function public.followups_sync() from authenticated;
revoke execute on function public.followups_after() from authenticated;
revoke execute on function public.set_doc_no() from authenticated;
revoke execute on function public.booking_cost_sync() from authenticated;
revoke execute on function public.invoice_paid_sync() from authenticated;
revoke execute on function public.invoice_status_sync() from authenticated;
revoke execute on function public.log_activity() from authenticated;
revoke execute on function public.touch_updated_at() from authenticated;
-- RLS helpers must stay callable by logged-in users
grant execute on function public.has_perm(text, text) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
-- future functions are not auto-exposed to anon
alter default privileges in schema public revoke execute on functions from public, anon;

alter function public.invoice_status_sync() set search_path = public;
alter function public.touch_updated_at() set search_path = public;


-- 2. Faster RLS: helper functions evaluated once per query (same rules, just faster)
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


-- 3. Indexes on the foreign keys the app filters / joins on
create index if not exists leads_contact_idx on public.leads(contact_id);
create index if not exists followups_lead_idx on public.followups(lead_id);
create index if not exists followups_assigned_idx on public.followups(assigned_to, status, due_at);
create index if not exists followups_contact_idx on public.followups(contact_id);
create index if not exists itineraries_lead_idx on public.itineraries(lead_id);
create index if not exists itineraries_contact_idx on public.itineraries(contact_id);
create index if not exists itineraries_parent_idx on public.itineraries(parent_id);
create index if not exists itinerary_items_it_idx on public.itinerary_items(itinerary_id);
create index if not exists bookings_contact_idx on public.bookings(contact_id);
create index if not exists bookings_lead_idx on public.bookings(lead_id);
create index if not exists bookings_itinerary_idx on public.bookings(itinerary_id);
create index if not exists bookings_handled_idx on public.bookings(handled_by);
create index if not exists bookings_start_idx on public.bookings(start_date);
create index if not exists booking_services_booking_idx on public.booking_services(booking_id);
create index if not exists booking_services_supplier_idx on public.booking_services(supplier_id);
create index if not exists invoices_booking_idx on public.invoices(booking_id);
create index if not exists invoices_contact_idx on public.invoices(contact_id);
create index if not exists invoices_date_idx on public.invoices(invoice_date);
create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id);
create index if not exists payments_booking_idx on public.payments(booking_id);
create index if not exists payments_invoice_idx on public.payments(invoice_id);
create index if not exists payments_contact_idx on public.payments(contact_id);
create index if not exists payments_supplier_idx on public.payments(supplier_id);
create index if not exists vouchers_booking_idx on public.vouchers(booking_id);
create index if not exists hotel_rates_hotel_idx on public.hotel_rates(hotel_id);
create index if not exists hotels_destination_idx on public.hotels(destination_id);
create index if not exists documents_contact_idx on public.documents(contact_id);
create index if not exists documents_lead_idx on public.documents(lead_id);
create index if not exists documents_booking_idx on public.documents(booking_id);
create index if not exists profiles_role_idx on public.profiles(role_id);
