"use client";

const portfolio = [
  {
    title: "Project One",
    category: "Commercial",
    description: "Premium brand commercial",
  },
  {
    title: "Project Two",
    category: "Music Video",
    description: "Director's vision realized",
  },
  {
    title: "Project Three",
    category: "Corporate",
    description: "Branded content series",
  },
  {
    title: "Project Four",
    category: "Short Form",
    description: "Social-first reels",
  },
];

export default function Portfolio() {
  return (
    <section id="portfolio" className="py-32 bg-black">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-20">
          <h2 className="text-6xl md:text-7xl font-bold mb-6">Portfolio</h2>
          <div className="w-16 h-1 bg-crimson"></div>
        </div>

        <div className="grid md:grid-cols-2 gap-12">
          {portfolio.map((item, idx) => (
            <div
              key={idx}
              className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 border border-gray-800 rounded-lg overflow-hidden hover:border-crimson transition cursor-pointer group"
            >
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center space-y-3">
                  <p className="text-gray-400 text-sm tracking-widest uppercase">
                    {item.category}
                  </p>
                  <h3 className="text-3xl font-bold group-hover:text-crimson transition">
                    {item.title}
                  </h3>
                  <p className="text-gray-400 text-base">{item.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
