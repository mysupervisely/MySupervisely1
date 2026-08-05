import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { AddMemberForm } from "@/components/org-admin/AddMemberForm";
import { MemberRow } from "@/components/org-admin/MemberRow";
import { requireOrganizationAdmin } from "@/lib/require-org-admin";
import { getOrganizationMembers } from "@/lib/organizations";

export const metadata: Metadata = {
  title: "Organization Members — DosePrepped",
};

/**
 * Organization member management (M5.5) — see
 * docs/doseprepped/ARCHITECTURE.md "M5.5 — Member management design".
 * Data comes from GET /organizations/:id/memberships (M5.4, unchanged);
 * mutations are the new email-based POST, the new PATCH (role change),
 * and the existing DELETE — all scoped to this organization only, all
 * enforced server-side by requireOrganizationAdmin regardless of what
 * this page renders.
 */
export default async function OrgAdminMembersPage() {
  const { organizationId } = await requireOrganizationAdmin();
  const members = await getOrganizationMembers(organizationId);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">Members</h1>
        <p className="text-sm text-ink-muted">
          People with access to this organization. Adding a member requires an existing DosePrepped account.
        </p>
      </div>

      <AddMemberForm organizationId={organizationId} />

      <Card className="overflow-x-auto">
        {members.length === 0 ? (
          <p className="text-sm text-ink-muted">No members yet.</p>
        ) : (
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Joined</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <MemberRow key={member.id} organizationId={organizationId} member={member} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
