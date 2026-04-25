import Header from "@/components/Header";
import Link from "next/link";
import { launchOrder, researchChecklist, researchQueue } from "@/lib/nudimmud";

export const metadata = {
  title: "NUDIMMUD | Research",
  description: "Client research workspace for NexusLink inside the NUDIMMUD shell.",
};

export default function ResearchPage() {
  return (
    <main className="min-h-screen bg-black">
      <Header />

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="max-w-3xl space-y-6">
          <p className="text-xs uppercase tracking-[0.35em] text-white/45">
            NUDIMMUD / Internal module
          </p>
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
            Client research workspace
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-white/70 md:text-2xl">
            The research host should feel like part of the shell: docs, source
            notes, and action states in one predictable place.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/40">
                Active briefs
              </p>
              <h2 className="mt-3 text-2xl font-semibold">Research queue</h2>
            </div>
              <Link
                href="/sources"
                className="rounded-full border border-white/15 bg-black/40 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
              >
                Open sources
              </Link>
            </div>

            <div className="mt-8 grid gap-4">
              {researchQueue.map((brief) => (
                <div
                  key={brief.name}
                  className="rounded-2xl border border-white/10 bg-black/40 p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">{brief.name}</h3>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/45">
                      {brief.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white/65">
                    {brief.note}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
              <p className="text-xs uppercase tracking-[0.35em] text-white/40">
                Brief standard
              </p>
              <ul className="mt-5 grid gap-2 text-sm text-white/70">
                {researchChecklist.map((item) => (
                  <li
                    key={item}
                    className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
              <p className="text-xs uppercase tracking-[0.35em] text-white/40">
                Launch order
              </p>
              <ol className="mt-5 space-y-3 text-sm text-white/70">
                {launchOrder.map((lane, index) => (
                  <li key={lane} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/40 text-xs text-white/55">
                      0{index + 1}
                    </span>
                    {lane}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-3xl border border-crimson/25 bg-crimson/10 p-8">
              <p className="text-xs uppercase tracking-[0.35em] text-white/55">
                Primary action
              </p>
              <h2 className="mt-3 text-2xl font-semibold">
                Convert notes into a usable brief
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-white/70">
                Keep the workspace narrow and legible. One source of truth, one
                clear next step.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
