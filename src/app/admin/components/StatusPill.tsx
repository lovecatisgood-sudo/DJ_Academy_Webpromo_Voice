type Tone = "slate" | "cyan" | "emerald" | "amber" | "red" | "violet";

const toneClasses: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function statusTone(status: string | null | undefined): Tone {
  if (!status) return "slate";
  if (["completed", "confirmed", "deal_closed", "closed_deal"].includes(status)) return "emerald";
  if (["appointment_set", "appointment_made"].includes(status)) return "cyan";
  if (["pending", "pending_follow_up", "pending_confirmation", "follow_up_later"].includes(status)) return "amber";
  if (["failed", "rejected", "cancelled", "no_show", "no_deal"].includes(status)) return "red";
  if (["not_closed_follow"].includes(status)) return "violet";
  return "slate";
}

export function formatStatus(value: string | null | undefined, fallback = "unknown") {
  return value ? value.replaceAll("_", " ") : fallback;
}

export function StatusPill({
  children,
  status,
  tone,
}: {
  children?: React.ReactNode;
  status?: string | null;
  tone?: Tone;
}) {
  const resolvedTone = tone ?? statusTone(status);

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${toneClasses[resolvedTone]}`}>
      {children ?? formatStatus(status)}
    </span>
  );
}
