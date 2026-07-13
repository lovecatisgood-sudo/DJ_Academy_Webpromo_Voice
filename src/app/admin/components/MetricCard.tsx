export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "cyan" | "amber" | "red" | "emerald";
}) {
  const accent = {
    default: "border-slate-200",
    cyan: "border-cyan-200",
    amber: "border-amber-200",
    red: "border-red-200",
    emerald: "border-emerald-200",
  }[tone];

  return (
    <div className={`rounded-xl border ${accent} bg-white p-4 shadow-sm`}>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
