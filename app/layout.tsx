import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maison Lumielle | Virtual Fitting Room",
  description: "Discover how Maison Lumielle pieces look on you.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}