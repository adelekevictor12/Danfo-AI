import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DanfoAI — Lagos transit, in your language",
  description:
    "Conversational Nigerian transit agent for danfo and BRT routes, powered by 0G decentralized AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
