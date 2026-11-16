import { Ubuntu } from "next/font/google";
import "./globals.css";

// Self-hosted at build time: no request to Google from the visitor's browser, no layout shift from a late font.
const ubuntu = Ubuntu({ weight: ["300", "400", "500", "700"], subsets: ["latin"], display: "swap", variable: "--font-ubuntu" });

export const metadata = {
  title: "Colatch — Find the face your brand deserves",
  description: "AI celebrity–brand matchmaking for India. Decode your brand DNA and match it against the full Colatch roster, cross-checked for competitor conflicts.",
  openGraph: {
    title: "Colatch — Find the face your brand deserves",
    description: "Decode your brand, then match it against 800+ celebrities on the Colatch roster.",
    images: ["https://colatch.com/roster/kriti-sanon.webp?v=3"],
  },
};

export const viewport = { themeColor: "#1F1524", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={ubuntu.variable}>
      <head>
        <link rel="preconnect" href="https://colatch.com" />
      </head>
      <body>{children}</body>
    </html>
  );
}
