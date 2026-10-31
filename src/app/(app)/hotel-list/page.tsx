"use client";
import { useEffect, useMemo, useState } from "react";
import { BedDouble, FileText, Image as ImageIcon } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import type { Destination, Hotel, Region, RegionGroup } from "@/lib/types";
import { Guard } from "@/components/auth";
import { GalleryModal, RichText } from "@/components/gallery";
import { Badge, Button, Empty, Modal, Spinner } from "@/components/ui";

export default function HotelListPage() {
  return <Guard module="itineraries"><HotelList /></Guard>;
}

const PAGE = 12;

function HotelList() {
  const [data, setData] = useState<{ hotels: Hotel[]; dests: Destination[]; regions: Region[]; groups: RegionGroup[] } | null>(null);
  const [group, setGroup] = useState("");
  const [by, setBy] = useState<"place" | "name">("name");
  const [q, setQ] = useState("");
  const [place, setPlace] = useState("");
  const [page, setPage] = useState(0);
  const [gallery, setGallery] = useState<Hotel | null>(null);
  const [desc, setDesc] = useState<Hotel | null>(null);

  useEffect(() => {
    (async () => {
      const supa = sb();
      const [h, d, r, g] = await Promise.all([
        supa.from("hotels").select("*").eq("is_active", true).order("name"),
        supa.from("destinations").select("*").order("name"),
        supa.from("regions").select("*").order("name"),
        supa.from("region_groups").select("*").eq("is_active", true).order("sort"),
      ]);
      const groups = (g.data ?? []) as RegionGroup[];
      setData({ hotels: (h.data ?? []) as Hotel[], dests: (d.data ?? []) as Destination[], regions: (r.data ?? []) as Region[], groups });
      if (groups[0]) setGroup(groups[0].id);
    })();
  }, []);

  const list = useMemo(() => {
    if (!data) return [];
    const regionIds = new Set(data.regions.filter((r) => !group || r.group_id === group).map((r) => r.id));
    const cityOk = new Set(data.dests.filter((d) => !group || (d.region_id && regionIds.has(d.region_id))).map((d) => d.id));
    const t = q.trim().toLowerCase();
    return data.hotels.filter((h) => (!group || (h.destination_id && cityOk.has(h.destination_id)))
      && (by === "place" ? !place || h.destination_id === place : !t || h.name.toLowerCase().includes(t)));
  }, [data, group, by, q, place]);
  useEffect(() => setPage(0), [group, by, q, place]);

  if (!data) return <Spinner />;
  const city = (id: string | null) => data.dests.find((d) => d.id === id)?.name ?? "";
  const regionIds = new Set(data.regions.filter((r) => !group || r.group_id === group).map((r) => r.id));
  const places = data.dests.filter((d) => !group || (d.region_id && regionIds.has(d.region_id)));
  const groupName = data.groups.find((g) => g.id === group)?.name ?? "all destinations";
  const pages = Math.max(1, Math.ceil(list.length / PAGE));

  return (
    <>
      <h1 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700"><BedDouble className="h-4 w-4" /> Hotels</h1>
      <div className="mb-5 flex flex-wrap items-end gap-4 rounded-2xl bg-white p-4 shadow-card">
        <label className="text-xs font-semibold text-slate-700">Select State
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="mt-1 block h-9 rounded-lg border border-slate-300 px-2 text-sm font-normal">
            <option value="">All</option>
            {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <div className="text-xs font-semibold text-slate-700">Search by
          <div className="mt-1 flex items-center gap-3 font-normal">
            <label className="flex items-center gap-1"><input type="radio" checked={by === "place"} onChange={() => setBy("place")} /> Place</label>
            <label className="flex items-center gap-1"><input type="radio" checked={by === "name"} onChange={() => setBy("name")} /> Hotel Name</label>
          </div>
        </div>
        {by === "place" ? (
          <select value={place} onChange={(e) => setPlace(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-sm">
            <option value="">All places</option>
            {places.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        ) : (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hotel name" className="h-9 w-64 rounded-lg border border-slate-300 px-3 text-sm" />
        )}
      </div>
      <p className="mb-3 text-sm text-slate-600">All Hotels in ({groupName}) · {list.length}</p>
      {list.length === 0 ? <Empty title="No hotels found" text="Add hotels with photos in Masters → Hotels." /> : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.slice(page * PAGE, page * PAGE + PAGE).map((h) => (
            <div key={h.id} className="overflow-hidden rounded-2xl bg-white shadow-card">
              {h.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.images[0]} alt={h.name} className="h-48 w-full object-cover" />
              ) : <div className="flex h-48 items-center justify-center bg-slate-100 text-slate-400"><BedDouble className="h-10 w-10" /></div>}
              <div className="p-3 text-center">
                <p className="font-bold text-slate-900">{h.name}</p>
                <p className="text-xs text-slate-500">{city(h.destination_id)}{h.category ? <> · <Badge>{h.category}</Badge></> : null}</p>
              </div>
              <div className="flex justify-around border-t border-slate-100 bg-slate-50 py-2 text-xs font-medium text-brand-700">
                <button onClick={() => setGallery(h)} className="flex items-center gap-1 hover:underline"><ImageIcon className="h-3.5 w-3.5" /> Images</button>
                <button onClick={() => setDesc(h)} className="flex items-center gap-1 hover:underline"><FileText className="h-3.5 w-3.5" /> Description</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="mt-5 flex flex-wrap justify-center gap-1">
          {Array.from({ length: pages }, (_, k) => (
            <button key={k} onClick={() => setPage(k)} className={k === page ? "h-8 w-8 rounded-lg bg-brand-600 text-sm text-white" : "h-8 w-8 rounded-lg bg-white text-sm text-slate-700 shadow-card"}>{k + 1}</button>
          ))}
        </div>
      )}
      <GalleryModal open={!!gallery} onClose={() => setGallery(null)} title={gallery?.name ?? ""} images={gallery?.images ?? []} />
      <Modal open={!!desc} onClose={() => setDesc(null)} title={desc?.name ?? ""} footer={<Button onClick={() => setDesc(null)}>OK</Button>}>
        <div className="text-sm text-slate-700">
          <RichText text={desc?.description || "No description added yet."} />
          {desc?.address && <p className="mt-3 text-xs text-slate-500">📍 {desc.address}</p>}
          {(desc?.check_in_time || desc?.check_out_time) && <p className="text-xs text-slate-500">Check-in {desc?.check_in_time} · Check-out {desc?.check_out_time}</p>}
        </div>
      </Modal>
    </>
  );
}
