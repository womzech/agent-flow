"use client";

import { useCallback, useState } from "react";

/**
 * Logout button that POSTs to /api/auth/logout with the CSRF token from
 * the `csrf_token` cookie. Replaces the v0.3 GET-based `<a>` link which
 * was a CSRF anti-pattern.
 */
export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const onClick = useCallback(async () => {
    setLoading(true);
    try {
      const csrf = readCookie("csrf_token");
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: csrf ? { "x-csrf-token": csrf } : {},
        redirect: "manual",          // 303 → /login; let us drive nav
        credentials: "same-origin",
      });
      // 303 is opaque-redirect under manual mode; treat any 2xx/3xx as success.
      if (res.type === "opaqueredirect" || res.status < 400) {
        window.location.href = "/login";
        return;
      }
      const body = await res.text();
      // eslint-disable-next-line no-console
      console.error("[logout] failed", res.status, body);
      window.alert("退出失败：" + body);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <button
      onClick={onClick}
      disabled={loading}
      title="退出登录"
      className="rounded-md border border-forge-line bg-forge px-2 py-1.5 text-xs text-forge-muted transition hover:text-ink-100 disabled:opacity-50"
    >
      {loading ? "…" : "⎋"}
    </button>
  );
}

function readCookie(name: string): string | null {
  const all = document.cookie.split(/;\s*/);
  for (const p of all) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    if (p.slice(0, eq) === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return null;
}
