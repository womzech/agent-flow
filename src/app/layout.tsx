import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentForge · 智造工坊",
  description: "AI Agent 顾问的销售 / 设计 / 开发 / 交付一体化工作台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-forge text-ink-100">{children}</body>
    </html>
  );
}
