"use client";

export default function Footer() {
  return (
    <footer className="py-16 bg-black border-t border-crimson/10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-16 mb-16">
          {/* Brand info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <img
                src="/logos/element dark nexus.svg"
                alt="Nexus Link"
                className="h-10 w-auto"
              />
              <span className="font-bold text-lg">NEXUS LINK</span>
            </div>
            <p className="text-gray-400 text-base leading-relaxed">
              Premium video production and post-production for premium brands.
            </p>
          </div>

          {/* Links */}
          <div className="space-y-4">
            <p className="font-bold text-lg tracking-wide">SERVICES</p>
            <ul className="space-y-3 text-gray-400">
              <li>
                <a href="#services" className="hover:text-crimson transition">
                  Video Production
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-crimson transition">
                  Post-Production
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-crimson transition">
                  Motion Graphics
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <p className="font-bold text-lg tracking-wide">CONTACT</p>
            <ul className="space-y-3 text-gray-400">
              <li>
                <a
                  href="mailto:contact@nexuslinkproductions.com"
                  className="hover:text-crimson transition"
                >
                  contact@nexuslinkproductions.com
                </a>
              </li>
              <li>Vienna, Austria</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-900 pt-8 text-center text-gray-500 text-sm">
          <p>
            © 2026 Nexus Link Productions. All rights reserved. |{" "}
            <a href="#" className="hover:text-crimson transition">
              Privacy
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
