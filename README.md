# A Link CRM — Travel CRM (Next.js 14 + Supabase)

A complete travel-agency CRM built to replace crmtravel.in for A Link Tours & Travels:
lead capture → follow-ups → itinerary / quotation → booking → GST invoice → vouchers → payments → P&L.

## Modules

| Module | What it does |
|---|---|
| **Dashboard** | Lead count (period + today), open pipeline, conversion %, sales & profit, upcoming trips, amount to collect, source and status breakdowns, today's follow-ups, unattended leads, 6-month sales chart, recent payments, birthdays and anniversaries. Toggle between team and own figures. |
| **Leads** | Manual entry with duplicate-phone warning; **Excel / CSV import** with column mapping and duplicate skip; **FB / Insta via Google Sheet** (auto-sync); **website form / webhook**; hosted `/enquiry` page; list and **Kanban pipeline** (drag & drop); filters; bulk assign / status / delete; CSV export; lost reasons; hot / warm / cold; round-robin auto-assign. |
| **Follow-ups** | Call, meeting, task, WhatsApp and email reminders. Overdue, today, upcoming and calendar views. Mark done with outcome, then schedule the next one. Full history on each lead's timeline. Bell notifications plus a browser popup when a follow-up is due. |
| **Contacts** | Auto-created from leads and de-duplicated by phone. Customer details, travel history, lifetime value, balance due, preferences (hotel, meal, budget), segments and tags, passport and expiry, DOB and anniversary filters, documents. |
| **Itinerary builder** | Package-calculator style: pick travel dates (nights auto), then for each day a **day plan** from Masters (fills title, details, night-stay city and Sedan / SUV / Innova Crysta cab cost). Hotels appear per night-stay city with only that city's hotels; cost is calculated night-by-night from season rates, check-in / check-out dates automatic. Pickup / drop points & times, inclusion / exclusion checkboxes (paid add-ons like Gondola tickets add their cost). |
| **Bookings / Trips** | One click turns an accepted quote into a booking with its services. Services: hotel, flight, cab, tour, visa and more, with supplier, confirmation number, cost and sell. Shows profit, received, due and supplier payables. |
| **Invoicing** | Branded GST tax invoice created automatically from a booking (package or itemized). CGST/SGST or IGST chosen by state. SAC code, TCS, amount in words, bank details, **UPI QR for the balance**. Paid / partly paid status updates automatically from payments. |
| **Vouchers** | Hotel, flight, cab and tour vouchers, or one combined voucher. Saved as a snapshot, with a shareable link and PDF. |
| **Payments** | Customer receipts (with a printable receipt), supplier payments and office expenses. |
| **Reports** | **P&L** (trip-wise, minus expenses = net profit), **GST / Tax** (month-wise plus an invoice register CSV for GSTR-1), sales by source and staff (with targets), lost-reason analysis, receivables, supplier payables. |
| **Masters** | Destinations, hotels with **season rate sheets**, suppliers, activities, transfers, inclusion / exclusion / terms / cancellation templates, WhatsApp / email templates, lead sources. CSV import and export. |
| **Users / Team** | Add staff logins, roles with a permission matrix (view / add / edit / delete / see everyone's / import), monthly targets, round-robin on/off, **full activity log** (who changed what). Permissions are enforced in the database (RLS). |

### Added beyond the original feature list
Kanban pipeline · duplicate detection · round-robin assignment · unattended-lead alerts · quote versions and customer "accept" link · supplier payables ledger · UPI QR on invoices · receipts · office expenses → net profit · GST register export · documents (passport / visa / tickets) · birthday / anniversary / passport-expiry alerts · global search · sales targets · WhatsApp / email templates · hosted enquiry form.

## Setup (about 15 minutes)

### 1. Supabase
1. Create a new project at supabase.com (region: Mumbai).
2. Open **SQL Editor** and run these files one by one, in order (each is safe to re-run):
   `supabase/001_schema.sql` → `supabase/002_hardening.sql` → `supabase/003_itinerary_v2.sql`
3. Under **Authentication → Providers → Email**, turn **off** "Allow new users to sign up". Admins add staff from the CRM.
4. Under **Authentication → URL Configuration**, set the Site URL to your CRM domain.

### 2. Environment
Copy `.env.example` to `.env.local` and fill it in from Supabase → Project Settings → API:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # server only
NEXT_PUBLIC_APP_URL=https://crm.alinktours.in
RESEND_API_KEY=                    # optional, for "Send now" email
```

### 3. Run
```bash
npm install
npm run dev        # http://localhost:3000
```
On the first visit, open **/setup** to create the admin account. Then fill in **Settings**: company, logo, GSTIN, state, bank, UPI.

### 4. Deploy (Vercel)
Import the folder or repo in Vercel, add the same environment variables, and deploy. `vercel.json` runs the Google Sheet sync once a day. For sync every 15 minutes, add the URL shown in Settings → Lead capture to cron-job.org.

## Lead capture
- **Facebook / Instagram lead ads** → Meta Leads Center / Zapier / Pabbly → Google Sheet → Settings → Lead capture → add the sheet link (shared as "Anyone with link: Viewer"). Use **Sync now** or the cron job. For instant leads, use the Apps Script shown on the same page.
- **Website** → copy the HTML form from Settings → Lead capture, or POST JSON to `/api/public/lead?key=…`.
- **Excel** → Leads → Import.

## What it does not do (yet)
- WhatsApp opens the staff member's own WhatsApp (wa.me) with the message ready to send. It is not the paid WhatsApp Business API.
- There is no live flight / hotel booking engine (B2B / B2C portal) or visa module. Visa is a service type on bookings.
- Single currency (INR). Foreign services are entered in INR.
- PDFs come from the browser's "Save as PDF" on the share page. This keeps the branding exact and needs no server.

## Tech
Next.js 14 (App Router, TypeScript) · Supabase (Postgres, Auth, RLS, Storage) · Tailwind · ExcelJS · qrcode.
Pricing and tax maths live in `src/lib/pricing.ts`. Run its unit tests with `npm test`.
Database logic (numbering, auto-contact, round-robin, follow-up sync, invoice paid status, audit log) is in SQL triggers in `supabase/001_schema.sql`.
