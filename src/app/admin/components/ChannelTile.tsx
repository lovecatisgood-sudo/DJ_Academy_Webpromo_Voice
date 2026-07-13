import Link from "next/link";
import { StatusPill } from "./StatusPill";

export function ChannelTile({
  name,
  description,
  status,
  href,
  stats,
  initials,
}: {
  name: string;
  description: string;
  status: string;
  href?: string;
  stats?: { label: string; value: React.ReactNode }[];
  initials?: string;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#0e7c86] text-xs font-bold text-white">
          {initials || name.slice(0, 2).toUpperCase()}
        </div>
        <StatusPill status={status}>{status}</StatusPill>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-950">{name}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      {stats?.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {stats.map((item) => (
            <div key={item.label} className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">{item.label}</div>
              <div className="mt-1 text-xl font-semibold text-slate-950">{item.value}</div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );

  if (!href) {
    return <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-5 text-slate-600">{content}</div>;
  }

  return (
    <Link href={href} className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300">
      {content}
    </Link>
  );
}
