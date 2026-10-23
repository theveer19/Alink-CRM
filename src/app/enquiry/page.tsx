import { getSettings } from "@/lib/share";
import { EnquiryForm } from "@/components/enquiry-form";

export const dynamic = "force-dynamic";

export default async function EnquiryPage({ searchParams }: { searchParams: { key?: string; source?: string } }) {
  const s = await getSettings();
  return (
    <div className="flex min-h-screen items-start justify-center bg-gradient-to-b from-slate-100 to-white p-4 pt-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.logo_url && <img src={s.logo_url} alt="" className="h-12 w-12 object-contain" />}
          <div>
            <h1 className="text-lg font-bold" style={{ color: s.brand_color }}>{s.company_name}</h1>
            <p className="text-sm text-slate-500">Tell us about your trip — we&apos;ll send a custom quote</p>
          </div>
        </div>
        <EnquiryForm apiKey={searchParams.key ?? ""} source={searchParams.source ?? "Website"} color={s.brand_color} phone={s.phone} />
      </div>
    </div>
  );
}
