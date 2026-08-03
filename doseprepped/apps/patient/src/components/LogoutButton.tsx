"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { API_URL } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={handleLogout} disabled={loading}>
      {loading ? "Logging out…" : "Log out"}
    </Button>
  );
}
