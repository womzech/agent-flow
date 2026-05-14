"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function ApproveSOWButton({ sowId }: { sowId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      await fetch("/api/sow", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? "",
        },
        body: JSON.stringify({ id: sowId, action: "approve" }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" onClick={handleApprove} disabled={loading}>
      {loading ? "确认中..." : "标记客户已确认"}
    </Button>
  );
}
