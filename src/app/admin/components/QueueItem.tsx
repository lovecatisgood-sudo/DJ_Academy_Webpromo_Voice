import Link from "next/link";
import { StatusPill } from "./StatusPill";

export function QueueItem({
  title,
  subtitle,
  meta,
  href,
  status,
  actionLabel = "Open",
  dataNoLocalize = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  href: string;
  status?: string | null;
  actionLabel?: string;
  dataNoLocalize?: boolean;
}) {
  return (
    <Link href={href} className="grid gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50/30 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div data-no-localize={dataNoLocalize || undefined} className="truncate font-semibold text-slate-950">{title}</div>
          {status ? <StatusPill status={status} /> : null}
        </div>
        {subtitle ? <div data-no-localize={dataNoLocalize || undefined} className="mt-1 line-clamp-2 text-slate-600">{subtitle}</div> : null}
        {meta ? <div data-no-localize={dataNoLocalize || undefined} className="mt-2 text-xs text-slate-500">{meta}</div> : null}
      </div>
      <div className="self-center text-sm font-semibold text-cyan-700">{actionLabel}</div>
    </Link>
  );
}
