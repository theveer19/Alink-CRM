"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { FileDown } from "lucide-react";

export function PrintBar({ title, label = "Print / Save as PDF" }: { title: string; label?: string }) {
  const params = useSearchParams();
  useEffect(() => {
    document.title = title;
    if (params.get("print") === "1") setTimeout(() => window.print(), 800);
  }, [params, title]);
  return (
    <div className="no-print mx-auto mb-3 flex max-w-[900px] justify-start px-3">
      <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-[#173a66] px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-[#10284a]">
        <FileDown className="h-4 w-4" /> {label}
      </button>
    </div>
  );
}
