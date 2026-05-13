/**
 * One-shot bootstrap that runs on every `getDb()` call (cheaply idempotent):
 *  1. Ensures the 22 built-in permissions exist.
 *  2. Ensures the 4 built-in roles exist with their grants.
 *  3. If `users` is empty AND `AGENTFLOW_PASSWORD` is set, creates
 *     `admin@local` with the `owner` role using that password (so v0.2
 *     deployments upgrade in place without ops intervention).
 *
 * Failures during bootstrap are logged but never throw, so a misconfigured
 * env can't bring down the rest of the app.
 */

import { record } from "./audit";
import { hashPassword } from "./password";
import { permissionsRepo, rolesRepo, usersRepo } from "./repo";
import { ALL_PERMISSIONS, BUILT_IN_ROLES } from "./schema";

let inFlight: Promise<void> | null = null;
let done = false;

export async function ensureBootstrapped(): Promise<void> {
  if (done) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      seedPermissionsAndRoles();
      await ensureAdminUser();
      done = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[bootstrap] failed", err);
      // Do NOT mark done so the next caller can retry.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function seedPermissionsAndRoles() {
  for (const p of ALL_PERMISSIONS) {
    permissionsRepo.upsert(p.action, p.resource, p.description);
  }
  for (const r of BUILT_IN_ROLES) {
    const role = rolesRepo.upsertSystem(r.name, r.description);
    permissionsRepo.setRolePermissions(role.id, r.permissions);
  }
}

async function ensureAdminUser() {
  if (usersRepo.count() > 0) return;
  const password = process.env.AGENTFLOW_PASSWORD;
  if (!password) {
    // No password set → leave users table empty; login page will show a
    // "set AGENTFLOW_PASSWORD and restart" hint.
    return;
  }
  const owner = rolesRepo.getByName("owner");
  if (!owner) return; // role seeding failed somehow; ensureBootstrapped will retry

  const hashed = await hashPassword(password);
  const u = usersRepo.create({
    email: "admin@local",
    name: process.env.AGENTFLOW_CONSULTANT_NAME || "Admin",
    wecom_userid: null,
    role_id: owner.id,
    ...hashed,
  });
  record({ action: "user.bootstrap", entity: "user", entityId: u.id, payload: { email: u.email, role: "owner" } });
}

/** Test helper — lets unit tests reset and re-run bootstrap. */
export function _resetBootstrapForTest() {
  done = false;
  inFlight = null;
}
