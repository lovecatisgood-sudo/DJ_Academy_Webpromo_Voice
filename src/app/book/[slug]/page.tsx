import { notFound } from "next/navigation";
import { getAvailableSlots } from "@/lib/availability";
import { verifyBookingContext } from "@/lib/booking-context";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

function groupSlots(slots: { start_at: string; end_at: string; label: string }[]) {
  const groups = new Map<string, typeof slots>();

  for (const slot of slots) {
    const key = new Date(new Date(slot.start_at).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    groups.set(key, [...(groups.get(key) || []), slot]);
  }

  return [...groups.entries()];
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ context?: string; booked?: string; error?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const context = verifyBookingContext(query.context);
  const sql = getSql();
  const [settings] = (await sql`
    select booking_enabled from settings where id = 1 limit 1
  `) as { booking_enabled: boolean }[];
  const [profile] = (await sql`
    select
      acp.booking_slug,
      acp.display_name,
      acp.meeting_title,
      acp.meeting_location,
      acp.default_duration_minutes,
      acp.booking_window_days
    from admin_calendar_profiles acp
    join admin_users au on au.id = acp.admin_user_id and au.is_active = true and au.deleted_at is null
    where acp.booking_slug = ${slug}
      and acp.is_active = true
    limit 1
  `) as {
    booking_slug: string;
    display_name: string;
    meeting_title: string;
    meeting_location: string | null;
    default_duration_minutes: number;
    booking_window_days: number;
  }[];

  if (!profile) notFound();

  const slots = settings?.booking_enabled
    ? await getAvailableSlots(
        sql,
        slug,
        new Date(),
        new Date(Date.now() + Math.min(profile.booking_window_days, 30) * 24 * 60 * 60 * 1000),
      )
    : [];
  const groupedSlots = groupSlots(slots.slice(0, 80));

  return (
    <main className="min-h-screen bg-[#050b1d] px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <div className="text-sm font-semibold text-cyan-200">DJAI Academy</div>
          <h1 className="mt-2 text-3xl font-semibold text-white">{profile.meeting_title}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {profile.default_duration_minutes} minutes with {profile.display_name}
            {profile.meeting_location ? ` · ${profile.meeting_location}` : ""}
          </p>
        </div>

        {query.booked ? (
          <section className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-6">
            <h2 className="text-xl font-semibold text-white">Appointment requested</h2>
            <p className="mt-2 text-sm text-cyan-50">
              Your requested time has been sent to DJAI Academy. The team will review and confirm the appointment.
            </p>
          </section>
        ) : (
          <form action="/api/booking/appointments" method="post" className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <input type="hidden" name="slug" value={slug} />
            {query.context ? <input type="hidden" name="context" value={query.context} /> : null}

            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-lg font-semibold text-white">Your details</h2>
              {query.error ? (
                <div className="mt-4 rounded-md border border-red-300/20 bg-red-400/10 px-3 py-2 text-sm text-red-100">
                  {query.error}
                </div>
              ) : null}
              <label className="mt-4 block text-sm text-slate-300">
                Name
                <input name="client_name" defaultValue={context?.clientName || ""} className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white" required />
              </label>
              <label className="mt-4 block text-sm text-slate-300">
                Email
                <input name="email" type="email" defaultValue={context?.email || ""} className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white" required />
              </label>
              <label className="mt-4 block text-sm text-slate-300">
                Company
                <input name="company_name" defaultValue={context?.companyName || ""} className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white" />
              </label>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Phone
                  <input name="phone" defaultValue={context?.phone || ""} className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white" />
                </label>
                <label className="block text-sm text-slate-300">
                  LINE
                  <input name="line_id" defaultValue={context?.lineId || ""} className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white" />
                </label>
                <label className="block text-sm text-slate-300">
                  WhatsApp
                  <input name="whatsapp" defaultValue={context?.whatsapp || ""} className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white" />
                </label>
              </div>
              <label className="mt-4 block text-sm text-slate-300">
                Note
                <textarea name="note" rows={4} className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white" />
              </label>
            </section>

            <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-lg font-semibold text-white">Choose a time</h2>
              {!settings?.booking_enabled ? (
                <div className="mt-4 rounded-md border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                  Booking is currently unavailable.
                </div>
              ) : groupedSlots.length === 0 ? (
                <div className="mt-4 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300">
                  No available slots are open right now.
                </div>
              ) : (
                <div className="mt-4 max-h-[620px] space-y-5 overflow-auto pr-1">
                  {groupedSlots.map(([date, daySlots]) => (
                    <div key={date}>
                      <div className="mb-2 text-sm font-semibold text-slate-200">
                        {new Date(`${date}T00:00:00+07:00`).toLocaleDateString(undefined, {
                          weekday: "long",
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {daySlots.map((slot) => (
                          <label key={slot.start_at} className="cursor-pointer rounded-md border border-white/10 bg-[#071026] px-3 py-2 text-center text-sm text-slate-100 has-[:checked]:border-cyan-300/70 has-[:checked]:bg-cyan-300/15">
                            <input name="start_at" type="radio" value={slot.start_at} className="sr-only" required />
                            {slot.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                disabled={!settings?.booking_enabled || groupedSlots.length === 0}
                className="mt-5 w-full rounded-md bg-gradient-to-r from-cyan-400 to-blue-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Request appointment
              </button>
            </section>
          </form>
        )}
      </div>
    </main>
  );
}
