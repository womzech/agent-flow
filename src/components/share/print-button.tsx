"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-[#f97316] px-3 py-1.5 text-sm font-medium text-white"
    >
      打印 / 另存 PDF
    </button>
  );
}
