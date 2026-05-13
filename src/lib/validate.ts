/**
 * Tiny zod-less validator. Just enough surface area to keep server actions
 * and API routes honest without adding a 100kB dep.
 *
 * Usage:
 *   const v = validate(input, {
 *     name: { type: "string", required: true, max: 120 },
 *     amount: { type: "int", min: 0 },
 *   });
 *   if (!v.ok) return v.error;       // standardized { error, code, fields }
 *   const safe = v.value;            // typed by caller via generic
 */

export interface FieldSpec {
  type: "string" | "int" | "number" | "enum" | "json" | "boolean";
  required?: boolean;
  min?: number;
  max?: number;
  /** For type: "enum". */
  values?: readonly string[];
  /** Default value if missing AND not required. */
  default?: unknown;
}

export type Schema = Record<string, FieldSpec>;

export interface ValidationError {
  error: string;
  code: "validation/failed";
  fields: Record<string, string>;
  status: 422;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: ValidationError };

export function validate<T extends Record<string, unknown>>(
  raw: Record<string, unknown> | FormData,
  schema: Schema,
): ValidationResult<T> {
  const errs: Record<string, string> = {};
  const out: Record<string, unknown> = {};
  const get = (k: string) => (raw instanceof FormData ? raw.get(k) : raw[k]);

  for (const [key, spec] of Object.entries(schema)) {
    const rawVal = get(key);
    const present = rawVal !== null && rawVal !== undefined && rawVal !== "";
    if (!present) {
      if (spec.required) {
        errs[key] = "必填";
        continue;
      }
      if ("default" in spec) out[key] = spec.default;
      continue;
    }
    switch (spec.type) {
      case "string": {
        const s = String(rawVal);
        if (spec.min != null && s.length < spec.min) errs[key] = `至少 ${spec.min} 个字符`;
        else if (spec.max != null && s.length > spec.max) errs[key] = `不超过 ${spec.max} 个字符`;
        else out[key] = s;
        break;
      }
      case "int": {
        const n = Number(rawVal);
        if (!Number.isInteger(n)) { errs[key] = "必须是整数"; break; }
        if (spec.min != null && n < spec.min) errs[key] = `不小于 ${spec.min}`;
        else if (spec.max != null && n > spec.max) errs[key] = `不大于 ${spec.max}`;
        else out[key] = n;
        break;
      }
      case "number": {
        const n = Number(rawVal);
        if (!Number.isFinite(n)) { errs[key] = "必须是数字"; break; }
        if (spec.min != null && n < spec.min) errs[key] = `不小于 ${spec.min}`;
        else if (spec.max != null && n > spec.max) errs[key] = `不大于 ${spec.max}`;
        else out[key] = n;
        break;
      }
      case "enum": {
        const v = String(rawVal);
        if (!spec.values?.includes(v)) errs[key] = `必须是 ${spec.values?.join(" / ")}`;
        else out[key] = v;
        break;
      }
      case "json": {
        if (typeof rawVal === "string") {
          try { out[key] = JSON.parse(rawVal); } catch { errs[key] = "JSON 解析失败"; }
        } else {
          out[key] = rawVal;
        }
        break;
      }
      case "boolean": {
        out[key] = rawVal === true || rawVal === "true" || rawVal === "on" || rawVal === "1";
        break;
      }
    }
  }

  if (Object.keys(errs).length > 0) {
    return {
      ok: false,
      error: {
        error: "校验失败",
        code: "validation/failed",
        fields: errs,
        status: 422,
      },
    };
  }
  return { ok: true, value: out as T };
}

/** Convenience: build a NextResponse-compatible body for an API error. */
export function jsonError(status: number, code: string, message: string, fields?: Record<string, string>) {
  return { body: { error: message, code, fields: fields ?? {} }, status };
}
