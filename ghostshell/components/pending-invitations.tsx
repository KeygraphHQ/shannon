"use client";

import { useState, useTransition } from "react";
import { Clock, Mail, MoreHorizontal, RefreshCw, X } from "lucide-react";
import { resendInvitation, revokeInvitation } from "@/lib/actions/invitations";

interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  createdAt: Date;
  invitedBy: {
    name: string | null;
    email: string;
  };
}

interface PendingInvitationsProps {
  invitations: Invitation[];
  orgId: string;
}

function formatTimeRemaining(expiresAt: Date): string {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();

  if (diff <= 0) return "Expired";

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h remaining`;
  return "Less than 1h remaining";
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export function PendingInvitations({ invitations, orgId }: PendingInvitationsProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleResend = (invitationId: string) => {
    setError(null);
    setSuccess(null);
    setOpenMenuId(null);
    startTransition(async () => {
      try {
        await resendInvitation(invitationId);
        setSuccess("Invitation resent successfully");
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to resend invitation");
      }
    });
  };

  const handleRevoke = (invitationId: string) => {
    setError(null);
    setSuccess(null);
    setOpenMenuId(null);
    startTransition(async () => {
      try {
        await revokeInvitation(invitationId);
        setSuccess("Invitation revoked");
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to revoke invitation");
      }
    });
  };

  if (invitations.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">
            Pending Invitations
          </h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            {invitations.length}
          </span>
        </div>
      </div>

      {(error || success) && (
        <div className="px-6 py-3">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-green-50 border border-green-100 p-3">
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}
        </div>
      )}

      <ul className="divide-y divide-gray-200">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Email Icon */}
                <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-amber-600" />
                </div>

                {/* Invitation Info */}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {invitation.email}
                    </p>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {ROLE_LABELS[invitation.role] || invitation.role}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Invited by {invitation.invitedBy.name || invitation.invitedBy.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Expiration */}
                <div className="text-right hidden sm:block">
                  <p className="text-sm text-amber-600">
                    {formatTimeRemaining(invitation.expiresAt)}
                  </p>
                </div>

                {/* Actions Menu */}
                <div className="relative">
                  <button
                    onClick={() =>
                      setOpenMenuId(openMenuId === invitation.id ? null : invitation.id)
                    }
                    disabled={isPending}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 transition-colors disabled:opacity-50"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>

                  {openMenuId === invitation.id && (
                    <>
                      {/* Backdrop to close menu */}
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpenMenuId(null)}
                      />
                      <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                        <button
                          onClick={() => handleResend(invitation.id)}
                          disabled={isPending}
                          className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Resend invitation
                        </button>
                        <button
                          onClick={() => handleRevoke(invitation.id)}
                          disabled={isPending}
                          className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                          Revoke invitation
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
