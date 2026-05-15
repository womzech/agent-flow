/**
 * Minimal structured JSON logger. One line per event, stable shape:
 *   { ts, level, event, ...context }
 *
 * Why not console.log directly: container log aggregators (Loki / CloudWatch /
 * Datadog) need machine-parseable lines. This module is intentionally tiny —
 * no transports, no rotation, no levels filtering beyond the env knob below.
 * stdout for info/debug, stderr for warn/error.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_LEVEL: number = LEVELS[(process.env.AGENTFLOW_LOG_LEVEL as LogLevel) || "info"] ?? LEVELS.info;

function emit(level: LogLevel, event: string, context: Record<string, unknown> = {}) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...context });
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const log = {
  debug: (event: string, ctx?: Record<string, unknown>) => emit("debug", event, ctx),
  info: (event: string, ctx?: Record<string, unknown>) => emit("info", event, ctx),
  warn: (event: string, ctx?: Record<string, unknown>) => emit("warn", event, ctx),
  error: (event: string, ctx?: Record<string, unknown>) => emit("error", event, ctx),
};
