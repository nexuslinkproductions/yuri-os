"use client";

import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(220,20,60,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.08),_transparent_24%)]" />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="max-w-4xl space-y-8">
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.35em] text-white/60">
            NUDIMMUD / NexusLink control surface
          </div>
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
            NexusLink is the public face. Research is the working face.
          </h1>
          <p className="max-w-3xl text-lg leading-relaxed text-white/72 md:text-2xl">
            One shell. One navigation layer. Public landing, internal research,
            and the design radar stay legible from the first screen.
          </p>
        </div>

        <div className="mt-12 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/research"
            className="rounded-full bg-crimson px-8 py-4 text-center text-base font-semibold tracking-wide text-black transition hover:bg-crimson-dark"
          >
            Open Research Workspace
          </Link>
          <Link
            href="/sources"
            className="rounded-full border border-white/15 bg-white/5 px-8 py-4 text-center text-base font-semibold tracking-wide text-white transition hover:bg-white/10"
          >
            View Sources
          </Link>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              Landing
            </p>
            <p className="mt-3 text-lg font-medium text-white">
              Public module, crisp hierarchy
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              Research
            </p>
            <p className="mt-3 text-lg font-medium text-white">
              Internal workspace, docs + action
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              Sources
            </p>
            <p className="mt-3 text-lg font-medium text-white">
              Design radar, reference shelf
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
