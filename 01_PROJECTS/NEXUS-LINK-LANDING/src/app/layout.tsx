import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NUDIMMUD | NexusLink Modules",
  description:
    "NexusLink landing and client research modules inside the NUDIMMUD shell.",
  openGraph: {
    title: "NUDIMMUD | NexusLink",
    description:
      "NexusLink landing and client research modules inside the NUDIMMUD shell.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
