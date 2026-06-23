import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  Copy,
  ArrowLeftRight,
  Users,
  Import,
  ShieldCheck,
  Check,
  ArrowRight,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

type ShiftRow = {
  name: string;
  initials: string;
  dark?: boolean;
  left: string;
  width: string;
  label: string;
};

const SCHEDULE_ROWS: ShiftRow[] = [
  { name: "Maya R.", initials: "MR", left: "0%", width: "56%", label: "08:00 – 14:00" },
  { name: "Devin K.", initials: "DK", dark: true, left: "20%", width: "58%", label: "10:00 – 16:00" },
  { name: "Lena P.", initials: "LP", left: "40%", width: "52%", label: "12:00 – 17:00" },
  { name: "Tom A.", initials: "TA", left: "0%", width: "40%", label: "08:00 – 12:00" },
  { name: "Priya S.", initials: "PS", left: "52%", width: "48%", label: "13:00 – 18:00" },
];

const STATS: { value: string; unit: string; label: string }[] = [
  { value: "5", unit: "sec", label: "From published shift to live calendar event" },
  { value: "1", unit: "click", label: "Push a whole day to every team calendar" },
  { value: "2", unit: "ways", label: "Build natively or import from Sling" },
  { value: "0", unit: "spreadsheets", label: "Coverage you can actually trust" },
];

const FEATURES: { icon: typeof CalendarDays; index: string; title: string; body: string }[] = [
  { icon: CalendarDays, index: "01", title: "Weekly shift grid", body: "A clean, fine-lined schedule where coverage and gaps read instantly." },
  { icon: Copy, index: "02", title: "Bulk operations", body: "Copy a pattern, duplicate a day, or delete a batch of shifts at once." },
  { icon: ArrowLeftRight, index: "03", title: "Google Calendar sync", body: "Every shift becomes a calendar event on the right person’s schedule." },
  { icon: Users, index: "04", title: "Team-wide push", body: "Admins sync an entire day to every calendar in a single action." },
  { icon: Import, index: "05", title: "Sling import", body: "Read your existing Sling shifts and keep them in sync alongside Agendo." },
  { icon: ShieldCheck, index: "06", title: "Role-based admin", body: "Publishing and team-wide calendar syncs stay in the right hands." },
];

const SYNC_POINTS = [
  "Publish once — the event appears on the agent’s calendar",
  "Edit a shift and the calendar event updates to match",
  "Admins push a full day to every team calendar at once",
];

/* A permanently-dark navy used for the contrast band + accent sky.    */
const NAVY = "#020817";
const SKY = "#65b5e6";

/* Compact Agendo block mark, recolourable via the fills below.        */
function AgendoMark({ size = 18, block = "#fff", accent = SKY }: { size?: number; block?: string; accent?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 184 183" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 133.875C0 131.041 2.29 128.744 5.12 128.744H178.77C181.59 128.744 183.88 131.041 183.88 133.875V177.869C183.88 180.703 181.59 183 178.77 183H5.12C2.29 183 0 180.703 0 177.869V133.875Z" fill={accent} />
      <path d="M129.4 70.18C129.4 67.35 131.69 65.05 134.52 65.05H178.88C181.71 65.05 184 67.35 184 70.18V113.96C184 116.79 181.71 119.09 178.88 119.09H134.52C131.69 119.09 129.4 116.79 129.4 113.96V70.18Z" fill={block} />
      <path d="M0.35 70.18C0.35 67.35 2.65 65.05 5.47 65.05H114C116.83 65.05 119.12 67.35 119.12 70.18V113.96C119.12 116.79 116.83 119.09 114 119.09H5.47C2.65 119.09 0.35 116.79 0.35 113.96V70.18Z" fill={block} />
      <path d="M65.23 5.84C65.23 3.01 67.52 0.71 70.35 0.71H178.88C181.71 0.71 184 3.01 184 5.84V49.61C184 52.45 181.71 54.75 178.88 54.75H70.35C67.52 54.75 65.23 52.45 65.23 49.61V5.84Z" fill={block} />
      <path d="M0 5.13C0 2.3 2.29 0 5.12 0H49.48C52.31 0 54.6 2.3 54.6 5.13V49.61C54.6 52.45 52.31 54.74 49.48 54.74H5.12C2.29 54.74 0 52.45 0 49.61V5.13Z" fill={accent} />
    </svg>
  );
}

function SectionKicker({ index, label, dark = false }: { index: string; label: string; dark?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 mb-6">
      <span className={`text-xs font-semibold tracking-[0.16em] ${dark ? "text-white" : "text-foreground"}`}>{index}</span>
      <span className={`h-px w-7 ${dark ? "bg-white/30" : "bg-foreground"}`} />
      <span className="text-xs font-semibold tracking-[0.16em] uppercase text-muted-foreground">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Home() {
  return (
    <div className="bg-background text-foreground font-outfit">
      {/* ===== HERO ===== */}
      <section className="mx-auto max-w-[1240px] px-10 pt-24 pb-20 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-x-[72px] gap-y-14 items-center">
        <div>
          <SectionKicker index="01" label="Shift management" />
          <h1 className="text-[clamp(40px,6vw,62px)] leading-[1.02] font-bold tracking-[-0.035em]">
            Schedules that
            <br />
            sync themselves.
          </h1>
          <p className="mt-6 max-w-[460px] text-lg leading-[1.55] font-light text-muted-foreground">
            Agendo is shift management built for support teams. Plan coverage, run bulk
            edits, and push every shift straight to your team&rsquo;s Google Calendars.
          </p>
          <div className="mt-9 flex items-center gap-4">
            <Link to="/login">
              <Button size="lg" className="gap-2">
                Start scheduling
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#schedule" className="px-2 py-3.5 text-[15px] font-medium">
              See it in action
            </a>
          </div>
          <div className="mt-14 flex items-center gap-7">
            <span className="text-[12.5px] text-muted-foreground">Trusted to schedule</span>
            <div className="flex items-center gap-[22px] opacity-90">
              <span className="text-sm font-semibold tracking-[-0.01em] text-muted-foreground">Tech Support</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span className="text-sm font-semibold tracking-[-0.01em] text-muted-foreground">Ops</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span className="text-sm font-semibold tracking-[-0.01em] text-muted-foreground">On-call</span>
            </div>
          </div>
        </div>

        {/* Schedule mockup */}
        <div className="rounded-[14px] border border-border overflow-hidden shadow-[0_30px_60px_-28px_rgba(2,8,23,0.18)] bg-white text-[#020817]">
          <div className="flex items-center justify-between px-[18px] py-4 border-b border-[#eef1f4]">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold tracking-[-0.01em]">Mon 12 May</span>
              <span className="text-[11.5px] text-[#94a0ad]">Week 20</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-md border border-[#d5e9f8] bg-[#eef6fd] px-2.5 py-[5px] text-[11px] font-medium text-[#1f6fa8]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SKY }} />
              Synced to Google
            </div>
          </div>
          <div className="grid grid-cols-[88px_repeat(5,1fr)] border-b border-[#eef1f4]">
            <div className="px-3.5 py-2.5 text-[10.5px] font-medium tracking-[0.04em] text-[#94a0ad]">AGENT</div>
            {["8", "10", "12", "14", "16"].map((h) => (
              <div key={h} className="py-2.5 text-center text-[10.5px] font-medium text-[#94a0ad]">{h}</div>
            ))}
          </div>
          {SCHEDULE_ROWS.map((r) => (
            <div key={r.name} className="grid grid-cols-[88px_repeat(5,1fr)] items-center h-[52px] border-b border-[#f1f4f7]">
              <div className="flex h-full items-center gap-2 border-r border-[#f1f4f7] px-3.5">
                <span
                  className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[9.5px] font-semibold"
                  style={r.dark ? { background: NAVY, color: "#fff" } : { background: "#eaf5fd", color: "#1f6fa8" }}
                >
                  {r.initials}
                </span>
                <span className="truncate text-xs font-medium">{r.name}</span>
              </div>
              <div className="relative col-start-2 col-end-7 h-full">
                <div
                  className="absolute inset-y-[11px] flex items-center rounded-md px-2.5"
                  style={{
                    left: r.left,
                    width: r.width,
                    background: r.dark ? NAVY : "#eaf5fd",
                    border: `1px solid ${r.dark ? NAVY : "#cbe6f8"}`,
                    color: r.dark ? "#fff" : "#1f6fa8",
                  }}
                >
                  <span className="whitespace-nowrap text-[10.5px] font-medium">{r.label}</span>
                </div>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between bg-[#fafbfc] px-[18px] py-[13px]">
            <span className="text-[11.5px] text-[#94a0ad]">5 agents · 38h coverage</span>
            <span className="text-[11.5px] font-medium text-[#1f6fa8]">Synced 2m ago</span>
          </div>
        </div>
      </section>

      {/* ===== STAT BAND ===== */}
      <section className="border-y border-border bg-muted/40">
        <div className="mx-auto max-w-[1240px] px-10 grid grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.label} className={`px-7 py-[38px] border-border ${i < STATS.length - 1 ? "lg:border-r" : ""} ${i % 2 === 0 ? "border-r lg:border-r" : ""}`}>
              <div className="flex items-baseline gap-[7px] whitespace-nowrap text-[clamp(30px,3vw,38px)] font-bold tracking-[-0.03em]">
                {s.value}
                <span className="text-[0.56em] font-semibold">{s.unit}</span>
              </div>
              <div className="mt-1.5 text-[13.5px] font-light leading-[1.4] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="mx-auto max-w-[1240px] px-10 pt-24 pb-10">
        <SectionKicker index="02" label="What it does" />
        <h2 className="max-w-[680px] text-[clamp(30px,4.4vw,42px)] leading-[1.05] font-bold tracking-[-0.03em]">
          Everything a coverage team needs, nothing it doesn&rsquo;t.
        </h2>
      </section>
      <section className="mx-auto max-w-[1240px] px-10 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-border">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.index} className="min-h-[212px] border-r border-b border-border px-[30px] pt-[34px] pb-[38px] transition-colors hover:bg-muted/40">
                <div className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-border text-foreground">
                  <Icon className="h-5 w-5" strokeWidth={1.6} />
                </div>
                <div className="mt-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground/60">{f.index}</div>
                <h3 className="mt-1.5 text-[18px] font-semibold tracking-[-0.015em]">{f.title}</h3>
                <p className="mt-2 text-sm font-light leading-[1.55] text-muted-foreground">{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== GOOGLE CALENDAR SYNC (permanent dark band) ===== */}
      <section id="sync" style={{ background: NAVY }} className="text-white">
        <div className="mx-auto max-w-[1240px] px-10 py-24 grid grid-cols-1 lg:grid-cols-[1fr_1.05fr] gap-20 items-center">
          <div>
            <SectionKicker index="03" label="Calendar sync" dark />
            <h2 className="text-[clamp(32px,4.6vw,44px)] leading-[1.04] font-bold tracking-[-0.03em]">
              The schedule lives
              <br />
              where your team
              <br />
              already looks.
            </h2>
            <p className="mt-6 max-w-[430px] text-[17px] font-light leading-[1.6] text-white/70">
              Publish a shift and it appears on the right person&rsquo;s Google Calendar in
              seconds. Edit it, and the event updates. Admins can push an entire day to
              every team calendar in one click.
            </p>
            <div className="mt-8 flex flex-col">
              {SYNC_POINTS.map((p) => (
                <div key={p} className="flex items-center gap-3 border-t border-white/10 py-3.5">
                  <Check className="h-[17px] w-[17px] flex-none" style={{ color: SKY }} strokeWidth={2.4} />
                  <span className="text-[15px] text-white/85">{p}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sync diagram */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center">
            <div className="rounded-[13px] border border-[#1f2836] bg-[#0b1320] p-[18px]">
              <div className="mb-4 flex items-center gap-2.5">
                <AgendoMark />
                <span className="text-[13px] font-semibold">Agendo</span>
              </div>
              {SCHEDULE_ROWS.slice(0, 3).map((r) => (
                <div
                  key={r.name}
                  className="mb-2 rounded-md px-2.5 py-2"
                  style={r.dark ? { background: "rgba(101,181,230,0.09)", border: "1px solid #2a4a63" } : { background: "rgba(16,25,38,0.2)", border: "1px solid #1f2836" }}
                >
                  <div className="text-[10.5px] font-semibold" style={{ color: r.dark ? "#9fd2f1" : "#dde2e8" }}>{r.name}</div>
                  <div className="mt-0.5 text-[9.5px]" style={{ color: r.dark ? "#7fa9c4" : "#8b96a4" }}>{r.label}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center gap-2 px-3.5">
              <ArrowLeftRight className="h-[34px] w-[34px]" style={{ color: SKY }} strokeWidth={1.6} />
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: SKY }}>Sync</span>
            </div>
            <div className="rounded-[13px] border border-[#1f2836] bg-[#0b1320] p-[18px]">
              <div className="mb-4 flex items-center gap-2.5">
                <CalendarDays className="h-4 w-4 text-[#dde2e8]" strokeWidth={1.6} />
                <span className="text-[13px] font-semibold">Google Calendar</span>
              </div>
              {["8:00 AM", "10:00 AM", "12:00 PM"].map((t) => (
                <div key={t} className="mb-2 rounded-r-md border-l-[2.5px] py-2 pl-2.5" style={{ borderColor: SKY, background: "rgba(16,25,38,0.5)" }}>
                  <div className="text-[10.5px] font-semibold text-[#dde2e8]">Support shift</div>
                  <div className="mt-0.5 text-[9.5px] text-[#8b96a4]">{t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== SCHEDULE + SLING ===== */}
      <section id="schedule" className="mx-auto max-w-[1240px] px-10 pt-24 pb-[90px] grid grid-cols-1 md:grid-cols-2 gap-16">
        <div className="rounded-[14px] border border-border px-[34px] py-9">
          <div className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground/60">NATIVE</div>
          <h3 className="mt-2.5 text-[25px] font-bold tracking-[-0.02em]">Build in Agendo</h3>
          <p className="mt-3 text-[15px] font-light leading-[1.6] text-muted-foreground">
            Drag out shifts on a clean weekly grid. Duplicate a day, bulk-copy a pattern
            across the week, and delete in batches. Coverage gaps are obvious at a glance.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["Bulk copy", "Duplicate day", "Batch delete"].map((t) => (
              <span key={t} className="rounded-full border border-border px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground">{t}</span>
            ))}
          </div>
        </div>
        <div className="rounded-[14px] border border-border px-[34px] py-9">
          <div className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground/60">MIGRATE</div>
          <h3 className="mt-2.5 text-[25px] font-bold tracking-[-0.02em]">Import from Sling</h3>
          <p className="mt-3 text-[15px] font-light leading-[1.6] text-muted-foreground">
            Already living in Sling? Pull existing shifts straight in, keep working, and
            sync them to Google Calendar all the same. Move at your own pace &mdash; no
            big-bang migration.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["Read existing shifts", "Side-by-side"].map((t) => (
              <span key={t} className="rounded-full border border-border px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground">{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== INTEGRATIONS STRIP ===== */}
      <section className="border-y border-border bg-muted/40">
        <div className="mx-auto max-w-[1240px] px-10 py-[54px] flex flex-wrap items-center justify-between gap-10">
          <div className="max-w-[560px]">
            <h3 className="text-2xl font-bold tracking-[-0.02em]">Built for support, wired into your stack.</h3>
            <p className="mt-2.5 text-[15px] font-light leading-[1.55] text-muted-foreground">
              Coverage that lives on every team calendar, with role-based admin that keeps
              publishing and team-wide syncs in the right hands.
            </p>
          </div>
          <div className="flex items-center gap-[30px]">
            <div className="text-center">
              <div className="text-[13px] font-semibold text-muted-foreground">Google Calendar</div>
              <div className="mt-[3px] text-[11.5px] text-muted-foreground/60">Two-way sync</div>
            </div>
            <span className="h-[38px] w-px bg-border" />
            <div className="text-center">
              <div className="text-[13px] font-semibold text-muted-foreground">Role-based</div>
              <div className="mt-[3px] text-[11.5px] text-muted-foreground/60">Admin controls</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="mx-auto max-w-[1240px] px-10 py-[110px] text-center">
        <div className="mb-6 inline-flex items-center gap-3.5">
          <span className="h-px w-7 bg-foreground" />
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Get started</span>
          <span className="h-px w-7 bg-foreground" />
        </div>
        <h2 className="mx-auto max-w-[760px] text-[clamp(36px,5.6vw,54px)] leading-[1.03] font-bold tracking-[-0.035em]">
          Put your next shift
          <br />
          on the calendar.
        </h2>
        <p className="mx-auto mt-5 max-w-[480px] text-lg font-light text-muted-foreground">
          Set up coverage once. Let Agendo keep every calendar in sync from there.
        </p>
        <div className="mt-9 flex items-center justify-center gap-4">
          <Link to="/login">
            <Button size="lg" className="gap-2">
              Start scheduling
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#features">
            <Button size="lg" variant="outline">Book a walkthrough</Button>
          </a>
        </div>
      </section>
    </div>
  );
}
