"use client";

const services = [
  {
    title: "Production",
    description:
      "Concept to delivery for campaigns, internal assets, and launch material.",
  },
  {
    title: "Post",
    description:
      "Editing, color, and finishing with clear handoff points.",
  },
  {
    title: "Motion",
    description:
      "Titles, systems, and motion language that stay readable at speed.",
  },
  {
    title: "Creative Direction",
    description:
      "Strategy, structure, and approval discipline before production starts.",
  },
];

export default function Services() {
  return (
    <section id="services" className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-12 flex items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/45">
              Landing module
            </p>
            <h2 className="mt-4 text-4xl font-semibold md:text-6xl">
              Capabilities
            </h2>
          </div>
          <div className="hidden h-px flex-1 bg-white/10 md:block" />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {services.map((service, idx) => (
            <div
              key={idx}
              className="group rounded-2xl border border-white/10 bg-white/5 p-8 transition hover:border-crimson/60 hover:bg-crimson/10"
            >
              <h3 className="text-2xl font-semibold transition group-hover:text-crimson">
                {service.title}
              </h3>
              <p className="mt-4 text-base leading-relaxed text-white/70">
                {service.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
