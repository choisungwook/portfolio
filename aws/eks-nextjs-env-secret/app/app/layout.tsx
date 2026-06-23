import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EKS Next.js env Secret demo",
  description: "Build-time env, runtime env, and Secret boundary demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
