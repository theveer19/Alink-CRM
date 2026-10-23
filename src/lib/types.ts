export type Role = { id: string; name: string; description: string | null; is_admin: boolean; permissions: Record<string, string[]> };

export type Profile = {
  id: string; full_name: string; email: string | null; phone: string | null; role_id: string | null;
  is_active: boolean; receives_leads: boolean; monthly_target: number; created_at: string;
  roles?: Role | null;
};

export type Settings = {
  id: number; company_name: string; tagline: string | null; logo_url: string | null; address: string | null; city: string | null;
  state: string | null; state_code: string | null; phone: string | null; email: string | null; website: string | null;
  gstin: string | null; pan: string | null; bank_name: string | null; bank_account_name: string | null; bank_account_no: string | null;
  bank_ifsc: string | null; upi_id: string | null; brand_color: string; currency: string;
  lead_prefix: string; quote_prefix: string; booking_prefix: string; invoice_prefix: string; voucher_prefix: string; receipt_prefix: string;
  default_markup_percent: number; default_gst_percent: number; gst_mode: "total" | "markup"; sac_code: string; default_tcs_percent: number;
  invoice_terms: string | null; itinerary_terms: string | null; voucher_notes: string | null;
  auto_assign: "none" | "round_robin"; unattended_hours: number;
};

export type Contact = {
  id: string; name: string; phone: string | null; alt_phone: string | null; email: string | null; city: string | null; state: string | null;
  address: string | null; customer_type: string; segment: string; tags: string[]; dob: string | null; anniversary: string | null;
  gender: string | null; passport_no: string | null; passport_expiry: string | null; gstin: string | null; company_name: string | null;
  pref_hotel_category: string | null; pref_meal: string | null; pref_budget: string | null; pref_notes: string | null; notes: string | null;
  owner_id: string | null; created_at: string;
};

export type Lead = {
  id: string; lead_no: string; contact_id: string | null; name: string; phone: string | null; email: string | null; city: string | null;
  source: string; campaign: string | null; status: string; priority: string; destination: string | null; travel_date: string | null;
  return_date: string | null; nights: number | null; adults: number; children: number; infants: number; budget: number | null;
  requirements: string | null; lost_reason: string | null; assigned_to: string | null; next_followup_at: string | null;
  last_activity_at: string | null; created_at: string; created_by: string | null; external_id: string | null;
};

export type Followup = {
  id: string; lead_id: string | null; contact_id: string | null; kind: string; title: string; notes: string | null; due_at: string;
  status: string; outcome: string | null; assigned_to: string | null; completed_at: string | null; created_at: string;
  leads?: { id: string; name: string; lead_no: string; phone: string | null; destination: string | null } | null;
};

export type Itinerary = {
  id: string; quote_no: string; version: number; parent_id: string | null; lead_id: string | null; contact_id: string | null;
  title: string; destination: string | null; start_date: string | null; nights: number; adults: number; children: number; infants: number;
  rooms: number; status: string; markup_type: "percent" | "fixed"; markup_value: number; discount: number; gst_percent: number;
  gst_mode: "total" | "markup"; tcs_percent: number; cost_total: number; markup_total: number; gst_total: number; tcs_total: number;
  grand_total: number; show_item_prices: boolean; overview: string | null; inclusions: string | null; exclusions: string | null;
  terms: string | null; cover_image: string | null; valid_till: string | null; share_token: string; booking_id: string | null;
  created_at: string; created_by: string | null;
};

export type ItineraryDay = { id?: string; itinerary_id?: string; day_no: number; title: string; description: string | null; destination_id: string | null; meals: string | null };

export type ItineraryItem = {
  id?: string; itinerary_id?: string; day_no: number | null; sort: number; item_type: string; ref_id: string | null;
  supplier_id: string | null; title: string; details: Record<string, any>; qty: number; unit_cost: number; cost: number; markup: number | null;
};

export type Booking = {
  id: string; booking_no: string; lead_id: string | null; contact_id: string | null; itinerary_id: string | null; title: string;
  destination: string | null; start_date: string | null; end_date: string | null; adults: number; children: number; infants: number;
  status: string; sell_amount: number; tax_amount: number; cost_amount: number; notes: string | null; handled_by: string | null; created_at: string;
  contact_name?: string; contact_phone?: string; received?: number; paid_to_suppliers?: number; balance_due?: number; profit?: number;
};

export type BookingService = {
  id: string; booking_id: string; service_type: string; supplier_id: string | null; title: string; details: Record<string, any>;
  start_date: string | null; end_date: string | null; confirmation_no: string | null; status: string; cost: number; sell: number; sort: number;
  suppliers?: { name: string; phone: string | null } | null;
};

export type Invoice = {
  id: string; invoice_no: string; booking_id: string | null; contact_id: string | null; bill_to_name: string; bill_to_address: string | null;
  bill_to_gstin: string | null; bill_to_phone: string | null; bill_to_email: string | null; place_of_supply: string | null;
  invoice_date: string; due_date: string | null; tax_type: "cgst_sgst" | "igst" | "none"; gst_percent: number; gst_mode: "total" | "markup";
  service_charge: number; tcs_percent: number; discount: number; subtotal: number; taxable_value: number; cgst: number; sgst: number;
  igst: number; tcs: number; total: number; amount_paid: number; status: string; notes: string | null; terms: string | null;
  share_token: string; created_at: string;
};

export type InvoiceItem = { id?: string; invoice_id?: string; description: string; sac: string | null; qty: number; rate: number; amount: number; sort: number };

export type Payment = {
  id: string; payment_no: string; direction: "in" | "out"; payment_date: string; amount: number; mode: string; reference: string | null;
  contact_id: string | null; supplier_id: string | null; booking_id: string | null; invoice_id: string | null; notes: string | null; created_at: string;
  contacts?: { name: string } | null; suppliers?: { name: string } | null; bookings?: { booking_no: string; title: string } | null;
  invoices?: { invoice_no: string } | null;
};

export type Voucher = {
  id: string; voucher_no: string; booking_id: string; voucher_type: string; service_ids: string[]; data: any; notes: string | null;
  share_token: string; created_at: string;
};

export type Supplier = { id: string; name: string; supplier_type: string; contact_person: string | null; phone: string | null; email: string | null; gstin: string | null; address: string | null; city: string | null; bank_details: string | null; notes: string | null; is_active: boolean };
export type Destination = { id: string; name: string; country: string; state: string | null; description: string | null; image_url: string | null; is_active: boolean };
export type Hotel = { id: string; name: string; destination_id: string | null; supplier_id: string | null; category: string | null; address: string | null; phone: string | null; email: string | null; check_in_time: string | null; check_out_time: string | null; notes: string | null; is_active: boolean };
export type Activity = { id: string; name: string; destination_id: string | null; supplier_id: string | null; duration: string | null; cost_adult: number; cost_child: number; description: string | null; is_active: boolean };
export type Transfer = { id: string; name: string; destination_id: string | null; supplier_id: string | null; vehicle_type: string | null; capacity: number; cost: number; description: string | null; is_active: boolean };
export type TextTemplate = { id: string; category: string; title: string; body: string };
