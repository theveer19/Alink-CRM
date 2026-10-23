export const LEAD_STATUSES = [
  { value: "new", label: "New", color: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  { value: "contacted", label: "Contacted", color: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
  { value: "qualified", label: "Qualified", color: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  { value: "quoted", label: "Quote Sent", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  { value: "negotiation", label: "Negotiation", color: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  { value: "won", label: "Won", color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  { value: "lost", label: "Lost", color: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  { value: "on_hold", label: "On Hold", color: "bg-slate-200 text-slate-700", dot: "bg-slate-500" },
] as const;

export const PRIORITIES = [
  { value: "hot", label: "Hot", color: "bg-rose-100 text-rose-700" },
  { value: "warm", label: "Warm", color: "bg-amber-100 text-amber-700" },
  { value: "cold", label: "Cold", color: "bg-sky-100 text-sky-700" },
] as const;

export const FOLLOWUP_KINDS = [
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "task", label: "Task" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
] as const;

export const LOST_REASONS = [
  "Price too high", "Booked with competitor", "Plan cancelled", "Not reachable", "Dates changed", "Just enquiring", "Other",
];

export const BOOKING_STATUSES = [
  { value: "confirmed", label: "Confirmed", color: "bg-sky-100 text-sky-700" },
  { value: "ongoing", label: "On Trip", color: "bg-amber-100 text-amber-700" },
  { value: "completed", label: "Completed", color: "bg-emerald-100 text-emerald-700" },
  { value: "cancelled", label: "Cancelled", color: "bg-rose-100 text-rose-700" },
] as const;

export const SERVICE_TYPES = [
  { value: "hotel", label: "Hotel" },
  { value: "flight", label: "Flight" },
  { value: "cab", label: "Cab / Transfer" },
  { value: "tour", label: "Tour / Activity" },
  { value: "train", label: "Train" },
  { value: "visa", label: "Visa" },
  { value: "insurance", label: "Insurance" },
  { value: "other", label: "Other" },
] as const;

export const ITEM_TYPES = [
  { value: "hotel", label: "Hotel" },
  { value: "transfer", label: "Transfer / Cab" },
  { value: "activity", label: "Activity / Sightseeing" },
  { value: "flight", label: "Flight" },
  { value: "train", label: "Train" },
  { value: "visa", label: "Visa" },
  { value: "insurance", label: "Insurance" },
  { value: "other", label: "Other" },
] as const;

export const INVOICE_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-slate-200 text-slate-700" },
  { value: "unpaid", label: "Unpaid", color: "bg-rose-100 text-rose-700" },
  { value: "partial", label: "Partly Paid", color: "bg-amber-100 text-amber-700" },
  { value: "paid", label: "Paid", color: "bg-emerald-100 text-emerald-700" },
  { value: "cancelled", label: "Cancelled", color: "bg-slate-200 text-slate-500" },
] as const;

export const QUOTE_STATUSES = [
  { value: "draft", label: "Draft", color: "bg-slate-200 text-slate-700" },
  { value: "sent", label: "Sent", color: "bg-sky-100 text-sky-700" },
  { value: "accepted", label: "Accepted", color: "bg-emerald-100 text-emerald-700" },
  { value: "rejected", label: "Rejected", color: "bg-rose-100 text-rose-700" },
] as const;

export const PAYMENT_MODES = ["UPI", "Cash", "Bank Transfer", "Card", "Cheque", "Payment Link", "Other"] as const;
export const MEAL_PLANS = [
  { value: "EP", label: "EP – Room only" },
  { value: "CP", label: "CP – Breakfast" },
  { value: "MAP", label: "MAP – Breakfast + Dinner" },
  { value: "AP", label: "AP – All meals" },
  { value: "AI", label: "AI – All inclusive" },
] as const;
export const HOTEL_CATEGORIES = ["Budget", "2 Star", "3 Star", "4 Star", "5 Star", "Resort", "Houseboat", "Homestay", "Camp"];
export const SEGMENTS = ["New", "Regular", "VIP", "Corporate", "B2B Agent", "Inactive"];
export const EXPENSE_CATEGORIES = ["Office Rent", "Salary", "Marketing / Ads", "Electricity", "Internet / Phone", "Travel", "Software", "Commission", "Other"];
export const DOC_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "visa", label: "Visa" },
  { value: "id_proof", label: "ID Proof" },
  { value: "ticket", label: "Ticket" },
  { value: "voucher", label: "Voucher" },
  { value: "invoice", label: "Invoice" },
  { value: "photo", label: "Photo" },
  { value: "other", label: "Other" },
] as const;

/** Permission modules and the actions each one supports. */
export const MODULES: { key: string; label: string; actions: string[] }[] = [
  { key: "dashboard", label: "Dashboard", actions: ["view"] },
  { key: "leads", label: "Leads", actions: ["view", "create", "edit", "delete", "view_all", "import"] },
  { key: "followups", label: "Follow-ups", actions: ["view", "create", "edit", "delete", "view_all"] },
  { key: "contacts", label: "Contacts & Documents", actions: ["view", "create", "edit", "delete"] },
  { key: "itineraries", label: "Itineraries / Quotes", actions: ["view", "create", "edit", "delete"] },
  { key: "bookings", label: "Bookings / Trips", actions: ["view", "create", "edit", "delete"] },
  { key: "invoices", label: "Invoices", actions: ["view", "create", "edit", "delete"] },
  { key: "payments", label: "Payments & Expenses", actions: ["view", "create", "edit", "delete"] },
  { key: "vouchers", label: "Vouchers", actions: ["view", "create", "edit", "delete"] },
  { key: "reports", label: "Reports (Tax, P&L)", actions: ["view"] },
  { key: "masters", label: "Masters", actions: ["view", "create", "edit", "delete"] },
  { key: "team", label: "Team & Activity Log", actions: ["view"] },
  { key: "settings", label: "Settings", actions: ["edit"] },
];

export const ACTION_LABELS: Record<string, string> = {
  view: "View", create: "Add", edit: "Edit", delete: "Delete", view_all: "See everyone's", import: "Import",
};

export function statusMeta<T extends { value: string }>(list: readonly T[], v: string | null | undefined): T | undefined {
  return list.find((x) => x.value === v);
}
