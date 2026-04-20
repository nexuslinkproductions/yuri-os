"use client";

const services = [
  {
    title: "Video Production",
    description:
      "Concept to delivery. Full production services for long-form and short-form content.",
  },
  {
    title: "Post-Production",
    description:
      "Editing, color grading, visual effects, and sound design. DaVinci Resolve, Premiere Pro.",
  },
  {
    title: "Motion Graphics",
    description:
      "Title sequences, kinetic typography, animated explainers. After Effects.",
  },
  {
    title: "Creative Direction",
    description:
      "Strategic creative guidance for your brand. Concept architecture and execution.",
  },
];

export default function Services() {
  return (
    <section id="services" className="py-32 bg-gradient-to-b from-slate-900/10 to-black">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-20">
          <h2 className="text-6xl md:text-7xl font-bold mb-6">Services</h2>
          <div className="w-16 h-1 bg-crimson"></div>
        </div>

        <div className="grid md:grid-cols-2 gap-12">
          {services.map((service, idx) => (
            <div
              key={idx}
              className="p-10 border border-gray-800 rounded-lg hover:border-crimson hover:bg-crimson/5 transition group"
            >
              <h3 className="text-2xl md:text-3xl font-bold mb-4 group-hover:text-crimson transition">
                {service.title}
              </h3>
              <p className="text-gray-300 leading-relaxed text-lg">
                {service.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
