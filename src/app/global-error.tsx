"use client";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="zh-CN">
      <body style={{ background: "#0c1325", color: "#e6ebf5", fontFamily: "system-ui, sans-serif", padding: 32 }}>
        <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>AgentFlow 严重错误</h1>
        <p style={{ color: "#9aa7bb", margin: "0 0 12px" }}>{error.message || "未捕获的渲染错误"}</p>
        {error.digest ? <p style={{ color: "#7e8aa8", fontSize: 12 }}>digest: {error.digest}</p> : null}
        <a href="/" style={{ color: "#fb923c", textDecoration: "underline" }}>返回首页</a>
      </body>
    </html>
  );
}
