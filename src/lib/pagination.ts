/**
 * Generic pagination helpers used by list pages.
 *
 * Query string format (read by RSC pages):
 *   ?page=2&pageSize=25
 *
 * Defaults:
 *   page     1 (1-indexed)
 *   pageSize 25 (capped at 200 to keep responses bounded)
 *
 * Renderers use the returned `{limit, offset, page}` directly with SQL:
 *   SELECT * FROM ... LIMIT ? OFFSET ?
 */

export interface PaginationInput {
  page?: string | number | null;
  pageSize?: string | number | null;
}

export interface Pagination {
  page: number;
  pageSize: number;
  limit: number;     // alias for pageSize, ergonomic at call site
  offset: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

export function parsePagination(sp: PaginationInput | URLSearchParams): Pagination {
  const get = (key: string): string | null =>
    sp instanceof URLSearchParams ? sp.get(key) : (sp[key as "page" | "pageSize"] as string | null | undefined) ?? null;
  const pageRaw = Number(get("page") ?? 1);
  const sizeRaw = Number(get("pageSize") ?? DEFAULT_PAGE_SIZE);
  const page = Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1);
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Number.isFinite(sizeRaw) ? Math.floor(sizeRaw) : DEFAULT_PAGE_SIZE));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function pageMeta(p: Pagination, totalRows: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(totalRows / p.pageSize));
  return {
    page: p.page,
    pageSize: p.pageSize,
    totalRows,
    totalPages,
    hasPrev: p.page > 1,
    hasNext: p.page < totalPages,
  };
}

/** Build a URL preserving existing query but overriding `page`. */
export function pageHref(basePath: string, currentParams: Record<string, string | undefined>, page: number): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(currentParams)) if (v) usp.set(k, v);
  usp.set("page", String(page));
  return `${basePath}?${usp.toString()}`;
}
