"use client";

export default function Hero() {
  return (
    <section className="min-h-screen bg-gradient-to-b from-transparent to-slate-900/20 pt-40 pb-24 flex items-center justify-center">
      <div className="max-w-7xl mx-auto px-6 text-center space-y-12">
        {/* Hero content */}
        <div className="space-y-8">
          <h1 className="text-7xl md:text-8xl font-bold leading-tight tracking-tight">
            Premium <span className="text-crimson">Production</span>
          </h1>
          <p className="text-lg md:text-2xl text-gray-300 max-w-4xl mx-auto leading-relaxed">
            Video, motion graphics, and post-production for premium brands.
            Vienna-based. Internationally recognized.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-6 justify-center pt-8">
          <button className="px-10 py-4 bg-crimson text-black font-bold rounded hover:bg-crimson-dark transition text-lg tracking-wide">
            View Portfolio
          </button>
          <button className="px-10 py-4 border-2 border-crimson text-crimson font-bold rounded hover:bg-crimson/10 transition text-lg tracking-wide">
            Let's Talk
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-8 pt-20 mt-20 border-t border-gray-800">
          <div className="text-center">
            <p className="text-4xl md:text-5xl font-bold text-crimson mb-2">50+</p>
            <p className="text-gray-400 text-sm uppercase tracking-widest">Projects Completed</p>
          </div>
          <div className="text-center">
            <p className="text-4xl md:text-5xl font-bold text-crimson mb-2">8+</p>
            <p className="text-gray-400 text-sm uppercase tracking-widest">Years Experience</p>
          </div>
          <div className="text-center">
            <p className="text-4xl md:text-5xl font-bold text-crimson mb-2">30+</p>
            <p className="text-gray-400 text-sm uppercase tracking-widest">Premium Brands</p>
          </div>
        </div>

        {/* Hero visual placeholder */}
        <div className="aspect-video bg-gradient-to-b from-slate-800 to-slate-900 border border-crimson/20 rounded-xl overflow-hidden mt-20 hover:border-crimson/40 transition">
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-gray-500 text-center">
              <p className="text-lg tracking-wide">HERO VISUAL — REEL/IMAGE SLOT</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
