"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "@/lib/actions/invitations";

interface AcceptInviteClientProps {
  token: string;
  invitation: {
    email: string;
    role: string;
    organization: {
      id: string;
      name: string;
      slug: string;
      logoUrl: string | null;
    };
    invitedBy: {
      name: string | null;
      email: string;
    };
  };
}

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Administrator",
  member: "Member",
  viewer: "Viewer",
};

export function AcceptInviteClient({ token, invitation }: AcceptInviteClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAccept = () => {
    setError(null);
    startTransition(async () => {
      try {
        await acceptInvitation(token);
        router.push("/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to accept invitation");
      }
    });
  };

  const handleDecline = () => {
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          {/* Organization Logo/Initial */}
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center">
            {invitation.organization.logoUrl ? (
              <img
                src={invitation.organization.logoUrl}
                alt={invitation.organization.name}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-indigo-600">
                {invitation.organization.name[0].toUpperCase()}
              </span>
            )}
          </div>

          <h1 className="text-xl font-semibold text-gray-900">
            Join {invitation.organization.name}
          </h1>
          <p className="mt-2 text-gray-600">
            <strong>{invitation.invitedBy.name || invitation.invitedBy.email}</strong>{" "}
            has invited you to join as a{" "}
            <strong>{roleLabels[invitation.role] || invitation.role}</strong>.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-100 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="mt-6 rounded-lg bg-gray-50 border border-gray-200 p-4">
          <h2 className="text-sm font-medium text-gray-700">
            What you&apos;ll get access to:
          </h2>
          <ul className="mt-2 space-y-2 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Security scans and findings
            </li>
            <li className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Team collaboration features
            </li>
            <li className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Security reports and insights
            </li>
          </ul>
        </div>

        <div className="mt-6 space-y-3">
          <button
            onClick={handleAccept}
            disabled={isPending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Accepting..." : "Accept Invitation"}
          </button>
          <button
            onClick={handleDecline}
            disabled={isPending}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Decline
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          Invitation for <strong>{invitation.email}</strong>
        </p>
      </div>
    </div>
  );
}
