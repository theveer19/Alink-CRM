"use client";
import type { ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Mountain, PackagePlus, PlusCircle } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import type { Contact, Lead, Region, RegionGroup } from "@/lib/types";
import { createPackage } from "@/lib/actions";
import { Guard, useAuth } from "@/components/auth";
import { Empty, Spinner } from "@/components/ui";

export default function ComposePage() {
  return <Guard module="itineraries" action="create"><Suspense fallback={<Spinner />}><Compose /></Suspense></Guard>;
}

/** Step 1: state cards → step 2: package cards → create the package and open the composer. Same as the portal. */
function Compose() {
  const params = useSearchParams();
  const router = useRouter();
  const { settings, can } = useAuth();
  const [groups, setGroups] = useState<RegionGroup[] | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const groupId = params.get("group");
  const leadId = params.get("lead");
  const contactId = params.get("contact");

  useEffect(() => {
    (async () => {
      const supa = sb();
      const [g, r] = await Promise.all([
        supa.from("region_groups").select("*").eq("is_active", true).order("sort").order("name"),
        supa.from("regions").select("*").eq("is_active", true).order("sort").order("name"),
      ]);
      if (g.error || r.error) toast.error("Run supabase/005_portal.sql in Supabase — " + (g.error ?? r.error)?.message);
      setGroups((g.data ?? []) as RegionGroup[]);
      setRegions((r.data ?? []) as Region[]);
      if (leadId) setLead(((await supa.from("leads").select("*").eq("id", leadId).single()).data as Lead) ?? null);
      if (contactId) setContact(((await supa.from("contacts").select("*").eq("id", contactId).single()).data as Contact) ?? null);
    })();
  }, [leadId, contactId]);

  if (!groups) return <Spinner />;

  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (leadId) p.set("lead", leadId);
    if (contactId) p.set("contact", contactId);
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return `/compose?${p.toString()}`;
  };

  async function create(r: Region) {
    setBusy(r.id);
    try {
      const id = await createPackage(settings, r.id, lead, contact);
      router.push(`/itineraries/${id}`);
    } catch (e: any) {
      toast.error(e.message);
      setBusy(null);
    }
  }

  const group = groups.find((g) => g.id === groupId);
  const ungrouped = regions.filter((r) => !r.group_id || !groups.some((g) => g.id === r.group_id));
  const forGroup = group ? regions.filter((r) => r.group_id === group.id) : [];

  return (
    <>
      {(lead || contact) && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-900">
          Composing a package for <b>{lead?.name ?? contact?.name}</b>{lead?.destination ? ` · enquiry: ${lead.destination}` : ""}{lead?.travel_date ? ` · ${lead.travel_date}` : ""}
        </div>
      )}
      {!group ? (
        <>
          <h1 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700"><Mountain className="h-4 w-4" /> Choose destination for package creation</h1>
          {groups.length + ungrouped.length === 0 ? (
            <Empty title="No destinations yet" text="Add a state and its packages in Masters → Regions / packages." action={can("masters", "create") ? <Link className="text-sm font-medium text-brand-700" href="/masters?tab=regions">Open Masters</Link> : undefined} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {groups.map((g) => (
                <PhotoCard key={g.id} image={g.image_url} title={g.name} sub={`${regions.filter((r) => r.group_id === g.id).length} packages`}
                  action={<Link href={keep({ group: g.id })} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"><PlusCircle className="h-3.5 w-3.5" /> Create</Link>} />
              ))}
              {ungrouped.map((r) => (
                <PhotoCard key={r.id} image={r.image_url} title={r.name} sub={r.country}
                  action={<button disabled={!!busy} onClick={() => create(r)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><PackagePlus className="h-3.5 w-3.5" /> {busy === r.id ? "Creating…" : "Compose Package"}</button>} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-card">
            <Link href={keep({})} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Destinations</Link>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><MapPin className="h-5 w-5" /></span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Explore destination</p>
                <p className="font-semibold text-slate-900">{group.name}</p>
              </div>
            </div>
          </div>
          {forGroup.length === 0 ? <Empty title="No packages in this destination" text="Add packages (Kashmir, Ladakh…) for it in Masters → Regions / packages." /> : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {forGroup.map((r) => (
                <PhotoCard key={r.id} image={r.image_url} title={r.name} tall
                  action={<button disabled={!!busy} onClick={() => create(r)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><PackagePlus className="h-3.5 w-3.5" /> {busy === r.id ? "Creating…" : "Compose Package"}</button>} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function PhotoCard({ image, title, sub, action, tall }: { image: string | null; title: string; sub?: string; action: ReactNode; tall?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className={tall ? "h-56 w-full object-cover" : "h-44 w-full object-cover"} />
      ) : (
        <div className={`flex ${tall ? "h-56" : "h-44"} w-full items-center justify-center bg-gradient-to-br from-brand-700 via-brand-500 to-sky-400 p-4 text-center text-2xl font-black text-white drop-shadow`}>{title}</div>
      )}
      <div className="space-y-2 p-3 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-700">{title}</p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
        {action}
      </div>
    </div>
  );
}
