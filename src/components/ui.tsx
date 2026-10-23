"use client";
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, X, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "icon";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...rest }, ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" && "h-8 px-2.5 text-xs",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "icon" && "h-8 w-8 text-sm",
        variant === "primary" && "bg-brand-700 text-white hover:bg-brand-800 shadow-sm",
        variant === "secondary" && "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
        variant === "success" && "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
        className
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

const fieldCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-500";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(fieldCls, "h-9", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(fieldCls, "py-2 min-h-[80px]", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select ref={ref} className={cn(fieldCls, "h-9 pr-8", className)} {...p}>
      {children}
    </select>
  );
});

export function Field({ label, children, hint, className, required }: { label: string; children: ReactNode; hint?: string; className?: string; required?: boolean }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function Card({ className, children, title, action, bodyClass }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; bodyClass?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white shadow-card", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {action}
        </div>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700 whitespace-nowrap", className)}>{children}</span>;
}

export function Modal({ open, onClose, title, children, footer, size = "md" }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[6vh]" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          "w-full rounded-xl bg-white shadow-xl animate-[fadeIn_.15s_ease-out]",
          size === "sm" && "max-w-md", size === "md" && "max-w-2xl", size === "lg" && "max-w-4xl", size === "xl" && "max-w-6xl"
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title = "Nothing here yet", text, action }: { title?: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Inbox className="h-10 w-10 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">{title}</p>
      {text && <p className="mt-1 max-w-sm text-xs text-slate-500">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-12", className)}>
      <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { value: string; label: ReactNode }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            value === t.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, icon, tone = "brand" }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: "brand" | "amber" | "rose" | "sky" | "emerald" | "violet" }) {
  const tones: Record<string, string> = {
    brand: "bg-brand-50 text-brand-700", amber: "bg-amber-50 text-amber-600", rose: "bg-rose-50 text-rose-600",
    sky: "bg-sky-50 text-sky-600", emerald: "bg-emerald-50 text-emerald-600", violet: "bg-violet-50 text-violet-600",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold text-slate-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
        {icon && <div className={cn("rounded-lg p-2", tones[tone])}>{icon}</div>}
      </div>
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500", className)}>{children}</th>;
}
export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("border-b border-slate-100 px-3 py-2.5 align-top text-slate-700", className)}>{children}</td>;
}

/** Button that asks "Sure?" on first click. */
export function ConfirmButton({ onConfirm, children, label = "Sure?", ...p }: BtnProps & { onConfirm: () => void | Promise<void>; label?: string }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      {...p}
      loading={busy}
      variant={armed ? "danger" : p.variant ?? "ghost"}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        try { await onConfirm(); } finally { setBusy(false); setArmed(false); }
      }}
    >
      {armed ? label : children}
    </Button>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn("w-56", className)} />;
}

export function Bar({ label, value, max, color = "bg-brand-500", right }: { label: ReactNode; value: number; max: number; color?: string; right?: ReactNode }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-800">{right ?? value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={cn("h-2 rounded-full", color)} style={{ width: `${value ? pct : 0}%` }} />
      </div>
    </div>
  );
}
