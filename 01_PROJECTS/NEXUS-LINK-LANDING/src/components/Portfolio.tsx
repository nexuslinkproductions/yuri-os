"use client";

const portfolio = [
  {
    title: "Launch Systems",
    category: "Control",
    description: "Command rail, route labels, and module entry logic.",
  },
  {
    title: "Client Briefing",
    category: "Research",
    description: "Workspace flow for notes, sources, and next actions.",
  },
  {
    title: "Reference Shelf",
    category: "Sources",
    description: "Design radar as a visible system, not buried context.",
  },
  {
    title: "Public Module",
    category: "Landing",
    description: "Crisp public surface with one dominant action strip.",
  },
];

export default function Portfolio() {
  return (
    <section id="portfolio" className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-12">
          <p className="text-xs uppercase tracking-[0.35em] text-white/45">
            Shell map
          </p>
          <h2 className="mt-4 text-4xl font-semibold md:text-6xl">
            Selected modules
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {portfolio.map((item, idx) => (
            <div
              key={idx}
              className="group aspect-video rounded-2xl border border-white/10 bg-gradient-to-br from-white/6 to-white/3 overflow-hidden transition hover:border-crimson/60"
            >
              <div className="flex h-full w-full items-center justify-center p-8">
                <div className="space-y-3 text-center">
                  <p className="text-xs tracking-[0.3em] text-white/40 uppercase">
                    {item.category}
                  </p>
                  <h3 className="text-3xl font-semibold transition group-hover:text-crimson">
                    {item.title}
                  </h3>
                  <p className="text-base text-white/65">{item.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
