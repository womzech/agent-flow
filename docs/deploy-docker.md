# Docker Deployment

Single-container deployment with the SQLite file mounted as a volume.

## Build + run

```bash
cp .env.example .env.local      # fill in AGENTFLOW_PASSWORD (+ ANTHROPIC_API_KEY)
docker compose build
docker compose up -d
```

The container exposes port `3000` and persists DB / backups under `./data` (mounted from the host).

## Verify

```bash
curl -sf http://localhost:3000/api/health | jq .
docker compose logs -f agent-flow
```

The image's `HEALTHCHECK` polls `/api/health` every 30s.

## Backup / restore inside the container

```bash
# hot backup, lands under the mounted data/ volume
docker compose exec agent-flow npm run backup

# manual restore: stop, swap file, restart
docker compose down
cp data/backups/agent-flow-20260516-0800.db data/agent-flow.db
docker compose up -d
```

## Notes

- Image is multi-stage; the runtime layer omits build tools. Final size ~150MB.
- `tini` is PID 1 to forward SIGTERM correctly so the Node process drains cleanly.
- `better-sqlite3` is built against Alpine in the builder stage; `libc6-compat` is the only runtime extra.
- For multi-host setups, replace the local `./data` mount with a network volume — but note SQLite is single-writer; do **not** point multiple containers at the same file.
