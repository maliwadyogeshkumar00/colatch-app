import "./globals.css";

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://colatch.com" />
        <link href="https://fonts.googleapis.com/css2?family=Ubuntu:wght@300;400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
