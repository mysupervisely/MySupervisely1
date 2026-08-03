import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";

export const metadata: Metadata = {
  title: "Profile — DosePrepped",
};

export default function ProfilePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Profile</h1>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Name</span>
          <span className="text-sm font-medium text-ink">Demo Patient</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Email</span>
          <span className="text-sm font-medium text-ink">demo.patient@example.com</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Role</span>
          <Badge tone="info">Patient</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Consent</span>
          <Badge tone="neutral">Not recorded</Badge>
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

      <PlaceholderNotice>
        Profile data shown here is a synthetic placeholder. Real accounts,
        consent tracking, and account deletion are reserved for milestone M1.
      </PlaceholderNotice>
    </>
  );
}
