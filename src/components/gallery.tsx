"use client";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { Modal } from "./ui";

/** Photo carousel in a modal (portal "Images" button). */
export function GalleryModal({ open, onClose, title, images }: { open: boolean; onClose: () => void; title: string; images: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [open, images]);
  const list = images.filter(Boolean);
  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      {list.length === 0 ? (
        <div className="flex h-60 flex-col items-center justify-center gap-2 text-slate-400"><ImageOff className="h-8 w-8" /> No photos added yet (Masters)</div>
      ) : (
        <div>
          <div className="relative overflow-hidden rounded-xl bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={list[i]} alt="" className="mx-auto h-[55vh] w-full object-contain" />
            {list.length > 1 && (
              <>
                <button onClick={() => setI((i - 1 + list.length) % list.length)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 hover:bg-white" aria-label="Previous"><ChevronLeft className="h-5 w-5" /></button>
                <button onClick={() => setI((i + 1) % list.length)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 hover:bg-white" aria-label="Next"><ChevronRight className="h-5 w-5" /></button>
              </>
            )}
          </div>
          {list.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {list.map((src, k) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={k} src={src} alt="" onClick={() => setI(k)} className={`h-16 w-24 shrink-0 cursor-pointer rounded-lg object-cover ${k === i ? "ring-2 ring-brand-600" : "opacity-70"}`} />
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Renders "text\n- bullet\n## heading" written in Masters (descriptions, terms, offers). */
export function RichText({ text, className }: { text: string | null | undefined; className?: string }) {
  const rows = (text ?? "").split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (list.length) out.push(<ul key={"u" + k} className="my-1 list-disc space-y-0.5 pl-5">{list.map((l, j) => <li key={j}>{bold(l)}</li>)}</ul>);
    list = [];
  };
  rows.forEach((r, k) => {
    const t = r.trim();
    if (/^[-•*]\s+/.test(t)) { list.push(t.replace(/^[-•*]\s+/, "")); return; }
    flush(k);
    if (!t) return;
    if (t.startsWith("## ")) out.push(<h4 key={k} className="mt-3 text-base font-bold text-slate-900">{t.slice(3)}</h4>);
    else if (t.startsWith("# ")) out.push(<h3 key={k} className="mt-3 text-lg font-bold text-slate-900">{t.slice(2)}</h3>);
    else out.push(<p key={k} className="my-1">{bold(t)}</p>);
  });
  flush(rows.length);
  return <div className={className}>{out}</div>;
}

function bold(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
}
