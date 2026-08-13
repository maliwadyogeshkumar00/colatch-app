export const metadata = { title: "Colatch — Brand to Celebrity Matchmaking", description: "AI brand-to-celebrity matchmaking, cross-checked for competitor conflicts." };
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{margin:0,fontFamily:"system-ui,-apple-system,Segoe UI,sans-serif",background:"#FAF7F2",color:"#241A2B",WebkitFontSmoothing:"antialiased"}}>{children}</body>
    </html>
  );
}
