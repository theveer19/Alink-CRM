"use client";
import { useState } from "react";

export function EnquiryForm({ apiKey, source, color, phone }: { apiKey: string; source: string; color: string; phone: string | null }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", city: "", destination: "", travel_date: "", nights: "", adults: "2", children: "0", budget: "", message: "", website_url: "" });
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const r = await fetch(`/api/public/lead?key=${encodeURIComponent(apiKey)}&source=${encodeURIComponent(source)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f),
    });
    if (r.ok) setState("done");
    else { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Something went wrong"); setState("error"); }
  }

  if (state === "done")
    return (
      <div className="py-10 text-center">
        <p className="text-4xl">🎉</p>
        <p className="mt-3 text-lg font-semibold">Thank you, {f.name.split(" ")[0]}!</p>
        <p className="mt-1 text-sm text-slate-500">Our travel expert will call you shortly{phone ? ` from ${phone}` : ""}.</p>
      </div>
    );

  const inp = "h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300";
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <input className={`${inp} col-span-2`} required placeholder="Your name *" value={f.name} onChange={set("name")} />
      <input className={inp} required placeholder="Mobile / WhatsApp *" inputMode="tel" value={f.phone} onChange={set("phone")} />
      <input className={inp} type="email" placeholder="Email" value={f.email} onChange={set("email")} />
      <input className={inp} placeholder="Your city" value={f.city} onChange={set("city")} />
      <input className={inp} placeholder="Where do you want to go?" value={f.destination} onChange={set("destination")} />
      <label className="text-xs text-slate-500">Travel date<input className={inp} type="date" value={f.travel_date} onChange={set("travel_date")} /></label>
      <label className="text-xs text-slate-500">Nights<input className={inp} type="number" min={1} value={f.nights} onChange={set("nights")} /></label>
      <label className="text-xs text-slate-500">Adults<input className={inp} type="number" min={1} value={f.adults} onChange={set("adults")} /></label>
      <label className="text-xs text-slate-500">Children<input className={inp} type="number" min={0} value={f.children} onChange={set("children")} /></label>
      <input className={`${inp} col-span-2`} placeholder="Budget (approx.)" value={f.budget} onChange={set("budget")} />
      <textarea className={`${inp} col-span-2 h-20 py-2`} placeholder="Anything else? (hotel type, occasion, special requests)" value={f.message} onChange={set("message")} />
      <input className="hidden" tabIndex={-1} autoComplete="off" value={f.website_url} onChange={set("website_url")} />
      {state === "error" && <p className="col-span-2 text-sm text-rose-600">{err}</p>}
      <button disabled={state === "busy"} className="col-span-2 h-11 rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: color }}>
        {state === "busy" ? "Sending…" : "Get my free quote"}
      </button>
    </form>
  );
}
