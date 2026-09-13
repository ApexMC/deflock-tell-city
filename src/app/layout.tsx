import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: "DeFlock Tell City — Our streets. Our privacy.",
  description: "Understand Flock cameras and automated license plate readers in Tell City, Indiana. Explore the privacy risks and sign the community petition for removal.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return(
    <html lang="en" className="dark">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
