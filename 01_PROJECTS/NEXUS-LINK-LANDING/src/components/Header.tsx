"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/nudimmud";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/logos/logo light nexus.svg"
            alt="Nexus Link Productions"
            className="h-12 w-auto transition hover:opacity-75"
          />
          <span className="hidden text-xs uppercase tracking-[0.35em] text-white/45 md:block">
            NUDIMMUD / NexusLink
          </span>
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          {navItems.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm tracking-wide transition ${
                  active
                    ? "bg-white text-black"
                    : "text-white/65 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <Link
          href="/research"
          className="rounded-full bg-crimson px-5 py-2 text-sm font-semibold tracking-wide text-black transition hover:bg-crimson-dark"
        >
          Launch
        </Link>
      </nav>
    </header>
  );
}
