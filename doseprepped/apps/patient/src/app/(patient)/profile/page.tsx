import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";
import { LogoutButton } from "@/components/LogoutButton";
import { requireRole } from "@/lib/require-role";

export const metadata: Metadata = {
  title: "Profile — DosePrepped",
};

export default async function ProfilePage() {
  const user = await requireRole("PATIENT");
  const createdAt = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Profile</h1>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Name</span>
          <span className="text-sm font-medium text-ink">
            {user.firstName} {user.lastName}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Email</span>
          <span className="text-sm font-medium text-ink">{user.email}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Role</span>
          <Badge tone="info">Patient</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Member since</span>
          <span className="text-sm font-medium text-ink">{createdAt}</span>
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-ink">Delete account</h2>
        <p className="text-sm text-ink-muted">
          Permanently delete your DosePrepped account and data.
        </p>
        <Button variant="secondary" className="w-fit" disabled>
          Delete account
        </Button>
      </Card>

      <LogoutButton />

      <PlaceholderNotice>
        Account deletion and consent tracking are not implemented yet —
        reserved for a later milestone.
      </PlaceholderNotice>
    </>
  );
}
