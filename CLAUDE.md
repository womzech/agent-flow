# CLAUDE.md

This file is loaded by Claude Code on every session in this repo.

**Read `AGENTS.md` first.** It is the canonical contract; this file only adds Claude-specific notes.

## Claude-specific notes

- This is a TypeScript / Next.js 14 (App Router) project. When generating new code, default to async server components for read-only views and Client Components (`"use client"`) only when you need state or events.
- The DB layer (`src/lib/db.ts`) is sync (better-sqlite3). Do not await it.
- The Anthropic SDK is centralized in `src/lib/anthropic.ts`. Reuse the exported `client` and helper prompt builders — do not re-instantiate.
- When asked to add a new workflow template, edit `src/lib/templates.ts` and update `docs/product-spec.md` §模板库. Do not scatter template definitions across files.
- Keep imports relative within `src/`. Path alias `@/` maps to `src/`.
