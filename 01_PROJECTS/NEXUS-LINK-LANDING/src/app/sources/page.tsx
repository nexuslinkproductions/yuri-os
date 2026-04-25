import Header from "@/components/Header";
import { designRadarSources } from "@/lib/nudimmud";

export const metadata = {
  title: "NUDIMMUD | Sources",
  description: "Design radar reference shelf for NexusLink and the NUDIMMUD shell.",
};

export default function SourcesPage() {
  return (
    <main className="min-h-screen bg-black">
      <Header />

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="max-w-3xl space-y-6">
          <p className="text-xs uppercase tracking-[0.35em] text-white/45">
            NUDIMMUD / Reference set
          </p>
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
            Design radar
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-white/70 md:text-2xl">
            Keep the reference layer visible. The shell should make it obvious
            which patterns are steering the landing page and the research host.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {designRadarSources.map((source) => (
            <article
              key={source.name}
              className="rounded-3xl border border-white/10 bg-white/5 p-7"
            >
              <p className="text-xs uppercase tracking-[0.35em] text-white/40">
                {source.name}
              </p>
              <p className="mt-4 text-lg font-semibold text-white">
                {source.signal}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-white/65">
                {source.apply}
              </p>
              <p className="mt-5 text-xs uppercase tracking-[0.3em] text-white/35">
                {source.file}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
