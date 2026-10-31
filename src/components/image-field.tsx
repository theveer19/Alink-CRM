"use client";
import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Link2, Loader2, X } from "lucide-react";
import { sb } from "@/lib/supabase/client";

async function upload(file: File, folder: string) {
  if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be under 5 MB");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb().storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return sb().storage.from("media").getPublicUrl(path).data.publicUrl;
}

/** Photos for hotels / places / regions: upload from computer or paste a link. */
export function ImagesField({ value, onChange, max = 8, folder = "misc" }: { value: string[]; onChange: (v: string[]) => void; max?: number; folder?: string }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const list = (value ?? []).filter(Boolean);
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const out = [...list];
      for (const f of Array.from(files).slice(0, max - list.length)) out.push(await upload(f, folder));
      onChange(out);
    } catch (e: any) {
      toast.error(`${e.message} — you can paste an image link instead`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {list.map((src, i) => (
          <div key={i} className="group relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-16 w-24 rounded-lg border border-slate-200 object-cover" />
            {i === 0 && max > 1 && <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] text-white">main</span>}
            <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-600 p-0.5 text-white opacity-90 hover:opacity-100" aria-label="Remove photo"><X className="h-3 w-3" /></button>
          </div>
        ))}
        {list.length < max && (
          <label className="flex h-16 w-24 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-slate-300 text-[10px] text-slate-500 hover:border-brand-400 hover:text-brand-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Upload
            <input type="file" accept="image/*" multiple={max > 1} hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {list.length < max && (
        <div className="flex gap-1">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste image link (https://…)" className="h-8 w-full rounded-lg border border-slate-300 pl-7 pr-2 text-xs" />
          </div>
          <button type="button" className="h-8 rounded-lg bg-slate-800 px-3 text-xs font-medium text-white disabled:opacity-40" disabled={!/^https?:\/\//.test(url.trim())}
            onClick={() => { onChange([...list, url.trim()]); setUrl(""); }}>Add</button>
        </div>
      )}
    </div>
  );
}
