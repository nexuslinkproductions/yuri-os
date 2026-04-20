"use client";

export default function Contact() {
  return (
    <section id="contact" className="py-32 bg-gradient-to-b from-slate-900/20 to-black">
      <div className="max-w-5xl mx-auto px-6 text-center">
        <div className="mb-16">
          <h2 className="text-6xl md:text-7xl font-bold mb-6">Let's Work</h2>
          <div className="w-16 h-1 bg-crimson mx-auto"></div>
        </div>

        <p className="text-xl md:text-2xl text-gray-300 mb-16 max-w-3xl mx-auto leading-relaxed">
          We work with premium brands on ambitious projects. If your vision
          requires precision and expertise, let's talk.
        </p>

        <div className="flex flex-col sm:flex-row gap-12 justify-center mb-16">
          <div>
            <p className="text-gray-500 text-sm mb-4 tracking-widest uppercase">
              EMAIL
            </p>
            <a
              href="mailto:contact@nexuslinkproductions.com"
              className="text-2xl md:text-3xl font-bold hover:text-crimson transition"
            >
              contact@nexuslinkproductions.com
            </a>
          </div>
          <div className="hidden sm:block w-px bg-gray-800"></div>
          <div>
            <p className="text-gray-500 text-sm mb-4 tracking-widest uppercase">
              LOCATION
            </p>
            <p className="text-2xl md:text-3xl font-bold">Vienna, Austria</p>
          </div>
        </div>

        <button className="px-10 py-4 bg-crimson text-black font-bold rounded hover:bg-crimson-dark transition text-lg tracking-wide">
          Schedule a Call
        </button>
      </div>
    </section>
  );
}
