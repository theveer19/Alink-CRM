"use client";
import { useState } from "react";
import { LOST_REASONS } from "@/lib/constants";
import type { Lead } from "@/lib/types";
import { Button, Input, Modal } from "./ui";

export function LostModal({ lead, onClose, onSave }: { lead: Lead | null; onClose: () => void; onSave: (reason: string) => void }) {
  const [r, setR] = useState(LOST_REASONS[0]);
  const [other, setOther] = useState("");
  return (
    <Modal open={!!lead} onClose={onClose} title="Mark lead as lost" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => onSave(r === "Other" ? other || "Other" : r)}>Mark lost</Button></>}>
      <div className="space-y-2">
        {LOST_REASONS.map((x) => (
          <label key={x} className="flex items-center gap-2 text-sm"><input type="radio" checked={r === x} onChange={() => setR(x)} /> {x}</label>
        ))}
        {r === "Other" && <Input placeholder="Reason" value={other} onChange={(e) => setOther(e.target.value)} />}
      </div>
    </Modal>
  );
}
