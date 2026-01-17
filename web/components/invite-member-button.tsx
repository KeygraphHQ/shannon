"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { InviteMemberModal } from "@/components/invite-member-modal";

interface InviteMemberButtonProps {
  orgId: string;
  canInvite: boolean;
  currentCount: number;
  limit: number;
  plan: string;
}

export function InviteMemberButton({
  orgId,
  canInvite,
  currentCount,
  limit,
  plan,
}: InviteMemberButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={!canInvite}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={
          !canInvite
            ? `Team member limit reached (${limit} for ${plan} plan)`
            : undefined
        }
      >
        <UserPlus className="h-4 w-4" />
        Invite Member
      </button>

      <InviteMemberModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        orgId={orgId}
        currentCount={currentCount}
        limit={limit}
        plan={plan}
      />
    </>
  );
}
