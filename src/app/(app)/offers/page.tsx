"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Gift, Megaphone, Tag } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import type { Notice, RegionGroup } from "@/lib/types";
import { fmtDate } from "@/lib/utils";
import { Guard } from "@/components/auth";
import { GalleryModal, RichText } from "@/components/gallery";
import { Empty, Spinner } from "@/components/ui";

export default function OffersPage() {
  return <Guard module="itineraries"><Suspense fallback={<Spinner />}><Offers /></Suspense></Guard>;
}

const META = {
  offer: { title: "Offer Packages", icon: Gift },
  discount: { title: "Discount List", icon: Tag },
  promotion: { title: "Promotional List", icon: Megaphone },
} as const;

function Offers() {
  const kind = (useSearchParams().get("kind") ?? "offer") as keyof typeof META;
  const meta = META[kind] ?? META.offer;
  const [groups, setGroups] = useState<RegionGroup[]>([]);
  const [group, setGroup] = useState("");
  const [rows, setRows] = useState<Notice[] | null>(null);
  const [open, setOpen] = useState<Notice | null>(null);

  useEffect(() => {
    sb().from("region_groups").select("*").eq("is_active", true).order("sort").then(({ data }) => setGroups((data ?? []) as RegionGroup[]));
  }, []);
  useEffect(() => {
    setRows(null);
    let q = sb().from("notices").select("*").eq("kind", kind).eq("is_active", true).order("sort").order("created_at", { ascending: false });
    if (group) q = q.or(`region_group_id.eq.${group},region_group_id.is.null`);
    q.then(({ data }) => setRows((data ?? []) as Notice[]));
  }, [kind, group]);

  const Icon = meta.icon;
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700"><Icon className="h-4 w-4" /> {meta.title}</h1>
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <label className="text-xs font-semibold text-slate-700">Select State
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="ml-2 h-9 rounded-lg border border-slate-300 px-2 text-sm font-normal">
            <option value="">All</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <div className="mt-4">
          {!rows ? <Spinner /> : rows.length === 0 ? <Empty title={`No ${meta.title.toLowerCase()} yet`} text="Add them in Masters → Offers / discount / promo." /> : kind === "offer" ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {rows.map((n) => (
                <button key={n.id} onClick={() => setOpen(n)} className="overflow-hidden rounded-xl border border-slate-200 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                  {n.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.image_url} alt={n.title} className="aspect-[3/4] w-full object-cover" />
                  ) : <div className="flex aspect-[3/4] items-center justify-center bg-gradient-to-br from-brand-600 to-sky-400 p-3 text-center text-lg font-bold text-white">{n.title}</div>}
                  <p className="truncate px-2 py-1.5 text-xs font-medium text-slate-700">{n.title}{n.valid_till ? ` · till ${fmtDate(n.valid_till)}` : ""}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {rows.map((n) => (
                <article key={n.id} className="rounded-xl border border-slate-200 p-4">
                  <h2 className="text-base font-bold uppercase text-slate-900">{n.title}</h2>
                  {n.valid_till && <p className="text-xs text-slate-500">Offer valid up to {fmtDate(n.valid_till)}</p>}
                  {n.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.image_url} alt="" className="my-3 max-h-96 rounded-lg object-contain" />
                  )}
                  <RichText text={n.body} className="text-sm leading-relaxed text-slate-700" />
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
      <GalleryModal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ""} images={open?.image_url ? [open.image_url] : []} />
    </div>
  );
}
