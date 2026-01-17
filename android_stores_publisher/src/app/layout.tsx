import type { ReactNode } from "react";

export const metadata = {
  title: "AppDeployer",
  description: "FS-based publisher for Android releases",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

