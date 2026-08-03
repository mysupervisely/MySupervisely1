"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { API_URL } from "@/lib/api";

export function ArchiveMedicationButton({ medicationId }: { medicationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleArchive() {
    setLoading(true);
    try {
      await fetch(`${API_URL}/medications/${medicationId}/archive`, {
        method: "POST",
        credentials: "include",
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={handleArchive} disabled={loading}>
      {loading ? "Marking inactive…" : "Mark Inactive"}
    </Button>
  );
}
