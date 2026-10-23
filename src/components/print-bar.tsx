"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";

export function PrintBar({ title }: { title: string }) {
  const params = useSearchParams();
  useEffect(() => {
    document.title = title;
    if (params.get("print") === "1") setTimeout(() => window.print(), 600);
  }, [params, title]);
  return (
    <div className="no-print mx-auto mb-3 flex max-w-[850px] justify-end px-2">
      <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
        <Printer className="h-4 w-4" /> Print / Save as PDF
      </button>
    </div>
  );
}
