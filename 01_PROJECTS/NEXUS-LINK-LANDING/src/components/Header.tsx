"use client";

export default function Header() {
  return (
    <header className="fixed top-0 w-full bg-white/90 backdrop-blur-lg border-b border-gray-200 z-50">
      <nav className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <a href="#" className="flex items-center">
          <img
            src="/logos/logo light nexus.svg"
            alt="Nexus Link Productions"
            className="h-16 w-auto hover:opacity-75 transition"
          />
        </a>

        <div className="hidden md:flex items-center gap-12">
          <a href="#services" className="text-gray-500 hover:text-crimson text-sm tracking-wide transition">
            Services
          </a>
          <a href="#portfolio" className="text-gray-500 hover:text-crimson text-sm tracking-wide transition">
            Portfolio
          </a>
          <a href="#contact" className="text-gray-500 hover:text-crimson text-sm tracking-wide transition">
            Contact
          </a>
        </div>

        <button className="px-8 py-3 bg-crimson text-white font-bold rounded hover:bg-crimson-dark transition tracking-wide">
          Get in Touch
        </button>
      </nav>
    </header>
  );
}
