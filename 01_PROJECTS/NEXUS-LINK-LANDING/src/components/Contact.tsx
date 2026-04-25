"use client";

export default function Contact() {
  return (
    <section id="contact" className="py-24">
      <div className="max-w-5xl mx-auto px-6 text-center">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-[0.35em] text-white/45">
            Launch action
          </p>
          <h2 className="mt-4 text-4xl font-semibold md:text-6xl">
            Start a brief
          </h2>
        </div>

        <p className="mx-auto mb-12 max-w-3xl text-lg leading-relaxed text-white/70 md:text-2xl">
          Landing, research, and internal notes should move together. If the
          brief is real, the shell is ready.
        </p>

        <div className="mb-12 flex flex-col justify-center gap-8 sm:flex-row">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.35em] text-white/45">
              EMAIL
            </p>
            <a
              href="mailto:contact@nexuslinkproductions.com"
              className="text-xl font-semibold transition hover:text-crimson md:text-3xl"
            >
              contact@nexuslinkproductions.com
            </a>
          </div>
          <div className="hidden sm:block w-px bg-white/10" />
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.35em] text-white/45">
              LOCATION
            </p>
            <p className="text-xl font-semibold md:text-3xl">Vienna, Austria</p>
          </div>
        </div>

        <button className="rounded-full bg-crimson px-8 py-4 text-base font-semibold tracking-wide text-black transition hover:bg-crimson-dark">
          Schedule a Call
        </button>
      </div>
    </section>
  );
}
