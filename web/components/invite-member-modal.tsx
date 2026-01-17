"use client";

import { useState, useTransition } from "react";
import { X, Shield, ShieldCheck, Eye, User as UserIcon, Mail } from "lucide-react";
import { OrgRole, ORG_ROLES } from "@/lib/auth";
import { sendInvitation } from "@/lib/actions/invitations";

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  currentCount: number;
  limit: number;
  plan: string;
}

const ROLES: { value: OrgRole; label: string; description: string; icon: React.ElementType }[] = [
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

export function InviteMemberModal({
  isOpen,
  onClose,
  orgId,
  currentCount,
  limit,
  plan,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>(ORG_ROLES.MEMBER);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    startTransition(async () => {
      try {
        await sendInvitation(orgId, email.trim(), role);
        setSuccess(true);
        setEmail("");
        setRole(ORG_ROLES.MEMBER);
        // Close after a short delay to show success
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send invitation");
      }
    });
  };

  const handleClose = () => {
    if (isPending) return;
    setEmail("");
    setRole(ORG_ROLES.MEMBER);
    setError(null);
    setSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Invite Team Member
          </h2>
          <button
            onClick={handleClose}
            disabled={isPending}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Team Capacity */}
          {limit !== Infinity && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="text-sm text-gray-600">
                Team capacity:{" "}
                <span className="font-medium text-gray-900">
                  {currentCount} / {limit}
                </span>{" "}
                <span className="text-gray-500">({plan} plan)</span>
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-green-50 border border-green-100 p-3">
              <p className="text-sm text-green-700">
                Invitation sent successfully!
              </p>
            </div>
          )}

          {/* Email Input */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email address
            </label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                disabled={isPending || success}
                className="block w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Role
            </label>
            <div className="mt-2 space-y-2">
              {ROLES.map((roleOption) => {
                const Icon = roleOption.icon;
                const isSelected = role === roleOption.value;

                return (
                  <button
                    key={roleOption.value}
                    type="button"
                    onClick={() => setRole(roleOption.value)}
                    disabled={isPending || success}
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
                        {roleOption.label}
                      </p>
                      <p
                        className={`text-xs ${isSelected ? "text-indigo-700" : "text-gray-500"}`}
                      >
                        {roleOption.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Note: Only owners can invite other owners.
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || success || !email.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Sending..." : success ? "Sent!" : "Send Invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
