"use client";
import { useState } from "react";

export function QuoteResponse({ token, status, whatsapp }: { token: string; status: string; whatsapp: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">(status === "accepted" ? "done" : "idle");
  async function accept() {
    setState("busy");
    const r = await fetch("/api/public/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    setState(r.ok ? "done" : "idle");
  }
  return (
    <div className="flex flex-wrap gap-2">
      <a href={whatsapp} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50">Chat on WhatsApp</a>
      {state === "done" ? (
        <span className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">✓ Thanks! We&apos;ll call you to confirm</span>
      ) : (
        <button onClick={accept} disabled={state === "busy"} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
          {state === "busy" ? "Sending…" : "I want to book this"}
        </button>
      )}
    </div>
  );
}
