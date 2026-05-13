export function fmtCents(cents: number): string {
  if (!Number.isFinite(cents) || cents === 0) return "¥0";
  return "¥" + (cents / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export function fmtRange(lo: number, hi: number, unit = "¥"): string {
  return `${unit}${lo.toLocaleString("zh-CN")} - ${unit}${hi.toLocaleString("zh-CN")}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  // SQLite default DATETIME is "YYYY-MM-DD HH:MM:SS"; treat as local for display.
  return iso.replace("T", " ").slice(0, 16);
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Minimal markdown → HTML renderer. We deliberately avoid pulling in `marked`
 * or `react-markdown` — the diagnostic reports use only headings, lists,
 * tables, paragraphs, code, blockquotes, and bold/italic. This keeps
 * dependencies tight and the output is rendered inside `.prose-forge`.
 */
export function renderMarkdown(md: string): string {
  if (!md) return "";

  // Escape HTML first.
  let s = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Fenced code blocks
  s = s.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_m, lang: string, body: string) => {
    return `<pre><code class="lang-${lang}">${body.replace(/\n$/, "")}</code></pre>`;
  });

  // Tables — very small subset. Each row is `| a | b |`. Header separator `| --- | --- |`.
  s = s.replace(/(^\|.+\|\s*\n\|[ \-|:]+\|\s*\n(?:\|.*\|\s*\n?)+)/gm, (block: string) => {
    const lines = block.trim().split("\n");
    const head = lines[0].split("|").slice(1, -1).map((c) => c.trim());
    const rows = lines.slice(2).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
    const thead = `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    return `<table>${thead}${tbody}</table>`;
  });

  // Headings
  s = s.replace(/^###### (.*)$/gm, "<h6>$1</h6>");
  s = s.replace(/^##### (.*)$/gm, "<h5>$1</h5>");
  s = s.replace(/^#### (.*)$/gm, "<h4>$1</h4>");
  s = s.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  s = s.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  s = s.replace(/^# (.*)$/gm, "<h1>$1</h1>");

  // Blockquote
  s = s.replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>");

  // Unordered & ordered lists (very simple)
  s = s.replace(/(?:^- .*(?:\n|$))+/gm, (block) => {
    const items = block.trim().split(/\n- /).map((l, i) => (i === 0 ? l.replace(/^- /, "") : l));
    return `<ul>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;
  });
  s = s.replace(/(?:^\d+\. .*(?:\n|$))+/gm, (block) => {
    const items = block.trim().split(/\n\d+\. /).map((l, i) => (i === 0 ? l.replace(/^\d+\. /, "") : l));
    return `<ol>${items.map((i) => `<li>${inline(i)}</li>`).join("")}</ol>`;
  });

  // Paragraphs from remaining lines
  s = s
    .split(/\n{2,}/)
    .map((block) => {
      if (/^\s*<(h\d|ul|ol|pre|table|blockquote)/.test(block)) return block;
      const lines = block.split("\n").map((l) => inline(l)).join("<br/>");
      return `<p>${lines}</p>`;
    })
    .join("\n");

  return s;

  function inline(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  }
}

export function safeJsonParse<T>(s: string | undefined | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
