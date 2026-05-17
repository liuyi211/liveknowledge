import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LiveKnowledge',
  description: 'Your personal knowledge companion',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
