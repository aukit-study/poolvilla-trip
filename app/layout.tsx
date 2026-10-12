import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ทริปพูลวิลล่า | บ้านรมณ์ดี เชียงใหม่",
  description: "พื้นที่แชร์รายชื่อ กำหนดการ และบัญชีค่าใช้จ่ายทริปพูลวิลล่า 1–2 พฤศจิกายน 2026",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
