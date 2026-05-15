# Ops Runbook (v0.5.1+)

> Day-to-day operations: backups, retention, branch protection, doctor.

## Backups

```bash
npm run backup                          # → data/backups/agent-flow-YYYYMMDD-HHmm.db
AGENTFLOW_BACKUP_DIR=/srv/snapshots npm run backup
```

- Uses SQLite Online Backup API; safe while `next dev`/`next start` is running.
- File output is a self-contained `.db` you can copy off-host.
- Recommended cadence: cron `0 */4 * * *` for hourly-ish; offsite sync via `rclone`/`restic`.
- Retention: **out of scope for this script**. Use filesystem snapshots or a cron+find pruner.

### Restore drill

1. Stop the running server: `pm2 stop agent-flow` (or your supervisor).
2. Move the live DB aside: `mv data/agent-flow.db data/agent-flow.db.broken`.
3. Copy the chosen snapshot in: `cp data/backups/agent-flow-20260516-0800.db data/agent-flow.db`.
4. Sanity-check before start: `sqlite3 data/agent-flow.db 'select count(*) from sessions; select max(version) from schema_migrations;'`.
5. Start the server and verify `/api/health`.
6. **Drill cadence**: run this against a staging copy at least monthly. A backup you have never restored is not a backup.

## Retention / cleanup

```bash
npm run cleanup -- --dry    # preview what would be cleaned
npm run cleanup             # apply
```

Tunables (env vars, all optional):

| Var | Default | Effect |
|---|---|---|
| `CLEANUP_LOGIN_ATTEMPTS_DAYS` | `30` | Delete `login_attempts` rows older than N days |
| `CLEANUP_SESSIONS_REVOKED_DAYS` | `7` | Delete revoked sessions older than N days |
| `CLEANUP_LOST_LEADS_DAYS` | `180` | Flag (does NOT mutate) lost leads >N days for human archive |
| `CLEANUP_EXPIRED_TOKENS` | `1` | Null out expired `share_token` / `portal_token` |

Recommended cron: `15 4 * * * cd /opt/agent-flow && /usr/bin/node /opt/agent-flow/node_modules/.bin/tsx scripts/cleanup.ts >> /var/log/agent-flow-cleanup.log 2>&1`

## Doctor (environment self-check)

```bash
npm run doctor
```

Reports on:

- Node version vs `engines.node`
- `.env.local` presence + required keys
- DB readable + migrations applied (version >= `SCHEMA_VERSION`)
- Optional services (Anthropic API key, WeCom config)
- Port 3000 free (dev) / build artifacts exist (prod)

Exit non-zero if any **required** check fails. Use as a pre-deploy gate.

## CI / branch protection (recommended)

`.github/workflows/ci.yml` already runs typecheck + lint + test + build on every push/PR to `main`.

Recommended GitHub branch-protection rules for `main`:

- ✅ Require status checks to pass before merging: `Typecheck + Lint + Test + Build (18.x)` + `… (20.x)`
- ✅ Require branches to be up to date before merging
- ✅ Require a pull request review (1 approver) for outside contributors
- ❌ Do **not** allow force pushes
- ❌ Do **not** allow deletions

These are not enforced by the repo — apply them in **Settings → Branches** on GitHub.

## Tokens (v0.6 hardening)

- `share_token` (diagnostics) — 30-day TTL by default; consultants can revoke from `/diagnostics/[id]`.
- `portal_token` (SOW) — 30-day TTL by default; consultants can revoke from `/sow/[id]`.
- Revoked or expired tokens show a friendly "已失效" page; views are counted (`token_view_count`, `token_last_viewed_at`).
- Cleanup script nulls out tokens once they pass expiry to keep the public surface minimal.
