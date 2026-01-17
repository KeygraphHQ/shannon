import { redirect } from "next/navigation";
import { hasOrgAccess, getUserOrgRole, ORG_ROLES } from "@/lib/auth";
import { getTeamMembers } from "@/lib/actions/memberships";
import { getPendingInvitations, canAddTeamMember } from "@/lib/actions/invitations";
import { db } from "@/lib/db";
import { TeamMemberList } from "@/components/team-member-list";
import { PendingInvitations } from "@/components/pending-invitations";
import { InviteMemberButton } from "@/components/invite-member-button";

interface TeamPageProps {
  params: Promise<{ orgId: string }>;
}

export default async function TeamPage({ params }: TeamPageProps) {
  const { orgId } = await params;

  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    redirect("/dashboard");
  }

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, plan: true, deletedAt: true },
  });

  if (!org || org.deletedAt) {
    redirect("/dashboard");
  }

  const userRole = await getUserOrgRole(orgId);
  const canManageTeam = userRole === ORG_ROLES.OWNER || userRole === ORG_ROLES.ADMIN;

  const [members, pendingInvitations, teamCapacity] = await Promise.all([
    getTeamMembers(orgId),
    canManageTeam ? getPendingInvitations(orgId) : Promise.resolve([]),
    canAddTeamMember(orgId),
  ]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage team members and their roles in {org.name}
          </p>
        </div>
        {canManageTeam && (
          <InviteMemberButton
            orgId={orgId}
            canInvite={teamCapacity.canAdd}
            currentCount={teamCapacity.currentCount}
            limit={teamCapacity.limit}
            plan={teamCapacity.plan}
          />
        )}
      </div>

      {/* Team Capacity Info */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Team Members</p>
            <p className="text-2xl font-bold text-gray-900">
              {members.length}
              <span className="text-base font-normal text-gray-500">
                {teamCapacity.limit === Infinity ? "" : ` / ${teamCapacity.limit}`}
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">Plan</p>
            <p className="text-sm capitalize text-gray-900">{org.plan}</p>
          </div>
        </div>
        {!teamCapacity.canAdd && teamCapacity.limit !== Infinity && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 p-3">
            <p className="text-sm text-amber-800">
              You&apos;ve reached your team member limit. Upgrade to add more members.
            </p>
          </div>
        )}
      </div>

      {/* Pending Invitations */}
      {canManageTeam && pendingInvitations.length > 0 && (
        <PendingInvitations invitations={pendingInvitations} orgId={orgId} />
      )}

      {/* Team Members */}
      <TeamMemberList
        members={members}
        orgId={orgId}
        canManageTeam={canManageTeam}
        currentUserRole={userRole}
      />
    </div>
  );
}
