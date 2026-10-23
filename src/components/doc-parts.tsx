import { Suspense, type ReactNode } from "react";
import type { Settings } from "@/lib/types";
import { PrintBar } from "./print-bar";

export function DocShell({ children, s, title }: { children: ReactNode; s: Settings; title: string }) {
  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0" style={{ ["--brand" as string]: s.brand_color }}>
      <Suspense fallback={null}><PrintBar title={title} /></Suspense>
      <div className="print-page mx-auto max-w-[850px] rounded-xl bg-white p-6 shadow-lg sm:p-10">{children}</div>
      <p className="no-print mt-4 text-center text-[11px] text-slate-400">{s.company_name}{s.website ? ` · ${s.website}` : ""}</p>
    </div>
  );
}

export function DocHeader({ s, right }: { s: Settings; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b-2 pb-4" style={{ borderColor: s.brand_color }}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {s.logo_url && <img src={s.logo_url} alt="" className="h-14 w-14 object-contain" />}
        <div>
          <p className="text-xl font-bold" style={{ color: s.brand_color }}>{s.company_name}</p>
          {s.tagline && <p className="text-xs text-slate-500">{s.tagline}</p>}
          <p className="mt-1 text-[11px] leading-4 text-slate-600">
            {[s.address, s.city, s.state].filter(Boolean).join(", ")}<br />
            {[s.phone, s.email, s.website].filter(Boolean).join(" · ")}
            {s.gstin && <><br />GSTIN: {s.gstin}</>}
          </p>
        </div>
      </div>
      {right && <div className="text-right">{right}</div>}
    </div>
  );
}

export function SectionTitle({ children, color }: { children: ReactNode; color: string }) {
  return <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide" style={{ color }}>{children}</h2>;
}

export function Lines({ text }: { text: string | null | undefined }) {
  const items = (text ?? "").split("\n").map((x) => x.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  if (!items.length) return null;
  return <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-slate-700">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

export function NotFound({ what }: { what: string }) {
  return <div className="flex min-h-screen items-center justify-center p-6 text-center text-slate-500">This {what} link is invalid or has been removed.</div>;
}
