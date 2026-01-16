"use client";

import { useState, useTransition } from "react";
import { X, Shield, ShieldCheck, Eye, User as UserIcon } from "lucide-react";
import { OrgRole, ORG_ROLES } from "@/lib/auth";
import { changeMemberRole } from "@/lib/actions/memberships";

interface TeamMember {
  id: string;
  role: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

interface ChangeRoleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  member: TeamMember;
  orgId: string;
  currentUserRole: OrgRole | null;
}

const ROLES: { value: OrgRole; label: string; description: string; icon: React.ElementType }[] = [
  {
    value: ORG_ROLES.OWNER,
    label: "Owner",
    description: "Full access including organization deletion",
    icon: ShieldCheck,
  },
  {
    value: ORG_ROLES.ADMIN,
    label: "Admin",
    description: "Can manage team and settings",
    icon: Shield,
  },
  {
    value: ORG_ROLES.MEMBER,
    label: "Member",
    description: "Can create and manage scans",
    icon: UserIcon,
  },
  {
    value: ORG_ROLES.VIEWER,
    label: "Viewer",
    description: "Read-only access",
    icon: Eye,
  },
];

export function ChangeRoleDialog({
  isOpen,
  onClose,
  member,
  orgId,
  currentUserRole,
}: ChangeRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<OrgRole>(member.role as OrgRole);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  // Filter available roles based on current user's role
  const availableRoles = ROLES.filter((role) => {
    // Admins cannot assign owner role
    if (currentUserRole === ORG_ROLES.ADMIN && role.value === ORG_ROLES.OWNER) {
      return false;
    }
    return true;
  });

  const handleSubmit = () => {
    if (selectedRole === member.role) {
      onClose();
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await changeMemberRole(orgId, member.user.id, selectedRole);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to change role");
      }
    });
  };

  const handleClose = () => {
    if (isPending) return;
    setError(null);
    setSelectedRole(member.role as OrgRole);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Change Role</h2>
          <button
            onClick={handleClose}
            disabled={isPending}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-lg font-medium text-gray-600">
                {(member.user.name || member.user.email)[0].toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {member.user.name || member.user.email.split("@")[0]}
              </p>
              <p className="text-sm text-gray-500">{member.user.email}</p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Select role
            </label>
            <div className="space-y-2">
              {availableRoles.map((role) => {
                const Icon = role.icon;
                const isSelected = selectedRole === role.value;

                return (
                  <button
                    key={role.value}
                    onClick={() => setSelectedRole(role.value)}
                    disabled={isPending}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    } disabled:opacity-50`}
                  >
                    <Icon
                      className={`h-5 w-5 ${isSelected ? "text-indigo-600" : "text-gray-400"}`}
                    />
                    <div>
                      <p
                        className={`text-sm font-medium ${isSelected ? "text-indigo-900" : "text-gray-900"}`}
                      >
                        {role.label}
                      </p>
                      <p
                        className={`text-xs ${isSelected ? "text-indigo-700" : "text-gray-500"}`}
                      >
                        {role.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={handleClose}
            disabled={isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || selectedRole === member.role}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
