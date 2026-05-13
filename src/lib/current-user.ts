import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";
import { resolvePat } from "./api-tokens";
import { SESSION_COOKIE, verifySession } from "./auth";
import { getDbReady } from "./db";
import { permissionsRepo, rolesRepo, usersRepo, type Role, type User } from "./repo";
import type { Permission, Resource } from "./schema";
import { findActiveByJti, touchLastUsed } from "./sessions";

export interface CurrentUser {
  user: User;
  role: Role;
  permissions: Set<Permission>;
}

/**
 * Resolve the logged-in user for the current request.
 *
 * Two sources, in order:
 *  1. The `x-agentforge-user-id` header (set by middleware after verifying
 *     the session cookie). This is the hot path during normal navigation.
 *  2. Decoding the cookie ourselves. Falls back when the middleware doesn't
 *     run (e.g. in server-action subrequests that bypass matcher rules in
 *     some Next.js versions).
 *
 * Returns null if no valid user is found — callers decide whether to call
 * `notFound()`, `redirect("/login")`, or throw forbidden().
 *
 * Wrapped in React.cache so a single request never queries the DB twice.
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  await getDbReady();

  let userId: number | null = null;

  // 1) Authorization: Bearer agf_xxx — programmatic API access.
  try {
    const auth = headers().get("authorization");
    if (auth && /^Bearer\s+/i.test(auth)) {
      const pat = auth.replace(/^Bearer\s+/i, "").trim();
      const resolved = resolvePat(pat);
      if (resolved) userId = resolved.userId;
    }
  } catch {
    /* headers() not available in some contexts; fall through */
  }

  // 2) Header set by middleware after verifying session cookie.
  if (!userId) {
    try {
      const hdr = headers().get("x-agentforge-user-id");
      if (hdr) userId = Number(hdr);
    } catch { /* see above */ }
  }

  // 3) Fall back to decoding the cookie ourselves (server actions in some
  //    Next versions miss the middleware-injected header).
  if (!userId) {
    try {
      const cookie = cookies().get(SESSION_COOKIE)?.value;
      const v = await verifySession(cookie);
      if (v.ok) {
        const sub = decodeSub(cookie!);
        if (sub) userId = sub;
      }
    } catch {
      /* same fall-through */
    }
  }

  // Verify the cookie's `sid` (jti) is still active in the sessions table.
  // Pre-v0.4 cookies have no sid → we accept them (back-compat); newly
  // issued cookies always carry one.
  if (userId) {
    try {
      const cookie = cookies().get(SESSION_COOKIE)?.value;
      if (cookie) {
        const sid = decodeSid(cookie);
        if (sid) {
          const sess = findActiveByJti(sid);
          if (!sess) {
            // Revoked / unknown session → treat as logged out.
            return null;
          }
          touchLastUsed(sid);
        }
      }
    } catch { /* see above */ }
  }

  if (!userId || !Number.isFinite(userId)) return null;
  const user = usersRepo.get(userId);
  if (!user || user.status !== "active") return null;
  const role = rolesRepo.get(user.role_id);
  if (!role) return null;
  const permissions = permissionsRepo.permissionsForUser(user.id);
  return { user, role, permissions };
});

function decodeSub(token: string): number | null {
  // Token format: base64url(JSON({sub,exp,sid?})).base64url(sig) — we already
  // know signature is valid by this point, so trust the body.
  const body = token.split(".")[0];
  try {
    const pad = body.length % 4 === 0 ? "" : "=".repeat(4 - (body.length % 4));
    const std = (body + pad).replace(/-/g, "+").replace(/_/g, "/");
    const obj = JSON.parse(atob(std)) as { sub?: number };
    return typeof obj.sub === "number" ? obj.sub : null;
  } catch {
    return null;
  }
}

function decodeSid(token: string): string | null {
  const body = token.split(".")[0];
  try {
    const pad = body.length % 4 === 0 ? "" : "=".repeat(4 - (body.length % 4));
    const std = (body + pad).replace(/-/g, "+").replace(/_/g, "/");
    const obj = JSON.parse(atob(std)) as { sid?: string };
    return typeof obj.sid === "string" ? obj.sid : null;
  } catch {
    return null;
  }
}

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "auth/required", "请先登录");
  return u;
}

export async function requirePermission(perm: Permission): Promise<CurrentUser>;
export async function requirePermission(action: "read" | "write", resource: Resource): Promise<CurrentUser>;
export async function requirePermission(...args: unknown[]): Promise<CurrentUser> {
  const perm: Permission = args.length === 1
    ? (args[0] as Permission)
    : (`${args[0] as string}:${args[1] as string}` as Permission);
  const u = await requireUser();
  if (!u.permissions.has(perm)) {
    throw new HttpError(403, "auth/forbidden", `缺少权限 ${perm}`);
  }
  return u;
}

export function hasPermission(u: CurrentUser | null, perm: Permission): boolean {
  return !!u && u.permissions.has(perm);
}
