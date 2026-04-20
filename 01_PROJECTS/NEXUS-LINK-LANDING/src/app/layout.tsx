import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus Link | Premium Video Production & Motion Graphics",
  description:
    "Premium video production, motion graphics, and post-production for premium brands. Vienna-based, internationally recognized.",
  viewport: "width=device-width, initial-scale=1",
  openGraph: {
    title: "Nexus Link Productions",
    description:
      "Premium video production & post-production services for premium brands.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gradient-to-b from-gray-50 via-gray-100 to-gray-50 text-gray-900 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
