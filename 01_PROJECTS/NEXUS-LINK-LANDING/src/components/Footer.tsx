"use client";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black py-16">
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
            <p className="text-white/65 text-base leading-relaxed">
              Public landing, research workspace, and source shelf inside one
              module shell.
            </p>
          </div>

          {/* Links */}
          <div className="space-y-4">
            <p className="font-bold text-lg tracking-wide">MODULES</p>
            <ul className="space-y-3 text-white/65">
              <li>
                <a href="/" className="hover:text-crimson transition">
                  NexusLink
                </a>
              </li>
              <li>
                <a href="/research" className="hover:text-crimson transition">
                  Research
                </a>
              </li>
              <li>
                <a href="/sources" className="hover:text-crimson transition">
                  Sources
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <p className="font-bold text-lg tracking-wide">CONTACT</p>
            <ul className="space-y-3 text-white/65">
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

        <div className="border-t border-white/10 pt-8 text-center text-white/45 text-sm">
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
