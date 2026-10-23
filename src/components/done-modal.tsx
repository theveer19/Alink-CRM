"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import type { Followup } from "@/lib/types";
import { Button, Modal, Textarea } from "./ui";

export function DoneModal({ fu, onClose, onDone, onNext }: { fu: Followup | null; onClose: () => void; onDone: () => void; onNext?: () => void }) {
  const [outcome, setOutcome] = useState("");
  const [next, setNext] = useState(true);
  if (!fu) return null;
  async function save() {
    const { error } = await sb().from("followups").update({ status: "done", outcome: outcome || null }).eq("id", fu!.id);
    if (error) return toast.error(error.message);
    toast.success("Follow-up completed");
    setOutcome("");
    onDone();
    if (next && onNext) onNext();
  }
  return (
    <Modal open onClose={onClose} title={`Complete: ${fu.title}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="success" onClick={save}><Check className="h-4 w-4" /> Done</Button></>}>
      <div className="space-y-3">
        <Textarea placeholder="Outcome — e.g. Interested, wants revised quote with 4★ hotels" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        {onNext && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={next} onChange={(e) => setNext(e.target.checked)} /> Schedule next follow-up</label>}
      </div>
    </Modal>
  );
}
