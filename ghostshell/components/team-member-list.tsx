"use client";

import { useState } from "react";
import { MoreHorizontal, Shield, ShieldCheck, Eye, User as UserIcon } from "lucide-react";
import { OrgRole, ORG_ROLES } from "@/lib/auth-types";
import { ChangeRoleDialog } from "@/components/change-role-dialog";
import { RemoveMemberDialog } from "@/components/remove-member-dialog";

interface TeamMember {
  id: string;
  role: string;
  createdAt: Date;
  lastActiveAt: Date | null;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    createdAt: Date;
  };
}

interface TeamMemberListProps {
  members: TeamMember[];
  orgId: string;
  canManageTeam: boolean;
  currentUserRole: OrgRole | null;
}

const ROLE_CONFIG = {
  owner: {
    label: "Owner",
    icon: ShieldCheck,
    color: "text-purple-600 bg-purple-50 border-purple-200",
    description: "Full access to all settings and can delete the organization",
  },
  admin: {
    label: "Admin",
    icon: Shield,
    color: "text-blue-600 bg-blue-50 border-blue-200",
    description: "Can manage team members and organization settings",
  },
  member: {
    label: "Member",
    icon: UserIcon,
    color: "text-green-600 bg-green-50 border-green-200",
    description: "Can create and manage scans",
  },
  viewer: {
    label: "Viewer",
    icon: Eye,
    color: "text-gray-600 bg-gray-50 border-gray-200",
    description: "Read-only access to scans and findings",
  },
};

function formatLastActive(date: Date | null): string {
  if (!date) return "Never";

  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

export function TeamMemberList({
  members,
  orgId,
  canManageTeam,
  currentUserRole,
}: TeamMemberListProps) {
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const canChangeRole = (member: TeamMember) => {
    if (!canManageTeam) return false;
    // Can't change your own role
    if (currentUserRole === member.role && members.filter(m => m.role === currentUserRole).length === 1) {
      return false;
    }
    // Admins can't change owner roles
    if (currentUserRole === ORG_ROLES.ADMIN && member.role === ORG_ROLES.OWNER) {
      return false;
    }
    return true;
  };

  const canRemoveMember = (member: TeamMember) => {
    if (!canManageTeam) return false;
    // Admins can't remove owners
    if (currentUserRole === ORG_ROLES.ADMIN && member.role === ORG_ROLES.OWNER) {
      return false;
    }
    return true;
  };

  const handleRoleChange = (member: TeamMember) => {
    setSelectedMember(member);
    setShowRoleDialog(true);
    setOpenMenuId(null);
  };

  const handleRemove = (member: TeamMember) => {
    setSelectedMember(member);
    setShowRemoveDialog(true);
    setOpenMenuId(null);
  };

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
        </div>
        <ul className="divide-y divide-gray-200">
          {members.map((member) => {
            const roleConfig = ROLE_CONFIG[member.role as keyof typeof ROLE_CONFIG];
            const RoleIcon = roleConfig?.icon || UserIcon;

            return (
              <li key={member.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="h-10 w-10 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center">
                      {member.user.avatarUrl ? (
                        <img
                          src={member.user.avatarUrl}
                          alt={member.user.name || member.user.email}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-medium text-gray-600">
                          {(member.user.name || member.user.email)[0].toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* User Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {member.user.name || member.user.email.split("@")[0]}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${roleConfig?.color || "text-gray-600 bg-gray-50 border-gray-200"}`}
                        >
                          <RoleIcon className="h-3 w-3" />
                          {roleConfig?.label || member.role}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{member.user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Last Active */}
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-gray-500">Last active</p>
                      <p className="text-sm text-gray-700">
                        {formatLastActive(member.lastActiveAt)}
                      </p>
                    </div>

                    {/* Actions Menu */}
                    {canManageTeam && (canChangeRole(member) || canRemoveMember(member)) && (
                      <div className="relative">
                        <button
                          onClick={() =>
                            setOpenMenuId(openMenuId === member.id ? null : member.id)
                          }
                          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 transition-colors"
                        >
                          <MoreHorizontal className="h-5 w-5" />
                        </button>

                        {openMenuId === member.id && (
                          <>
                            {/* Backdrop to close menu */}
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setOpenMenuId(null)}
                            />
                            <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                              {canChangeRole(member) && (
                                <button
                                  onClick={() => handleRoleChange(member)}
                                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  Change role
                                </button>
                              )}
                              {canRemoveMember(member) && (
                                <button
                                  onClick={() => handleRemove(member)}
                                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                >
                                  Remove from team
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Dialogs */}
      {selectedMember && (
        <>
          <ChangeRoleDialog
            isOpen={showRoleDialog}
            onClose={() => {
              setShowRoleDialog(false);
              setSelectedMember(null);
            }}
            member={selectedMember}
            orgId={orgId}
            currentUserRole={currentUserRole}
          />
          <RemoveMemberDialog
            isOpen={showRemoveDialog}
            onClose={() => {
              setShowRemoveDialog(false);
              setSelectedMember(null);
            }}
            member={selectedMember}
            orgId={orgId}
          />
        </>
      )}
    </>
  );
}
