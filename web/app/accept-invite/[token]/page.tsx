import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getInvitationByToken, acceptInvitation } from "@/lib/actions/invitations";
import { AcceptInviteClient } from "./client";

interface AcceptInvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function AcceptInvitePage({ params }: AcceptInvitePageProps) {
  const { token } = await params;
  const { userId } = await auth();

  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            Invitation Not Found
          </h1>
          <p className="mt-2 text-gray-600">
            This invitation link is invalid or has been revoked.
          </p>
          <a
            href="/sign-in"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }

  if (invitation.status === "expired" || invitation.expiresAt < new Date()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
            <svg
              className="h-6 w-6 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            Invitation Expired
          </h1>
          <p className="mt-2 text-gray-600">
            This invitation has expired. Please ask the team administrator to send
            a new invitation.
          </p>
          <a
            href="/sign-in"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }

  if (invitation.status === "accepted") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <svg
              className="h-6 w-6 text-green-600"
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
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            Invitation Already Accepted
          </h1>
          <p className="mt-2 text-gray-600">
            This invitation has already been accepted.
          </p>
          <a
            href="/dashboard"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const roleLabels: Record<string, string> = {
    owner: "Owner",
    admin: "Administrator",
    member: "Member",
    viewer: "Viewer",
  };

  // If user is not logged in, show invitation details and sign-in prompt
  if (!userId) {
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
              You&apos;ve been invited!
            </h1>
            <p className="mt-2 text-gray-600">
              <strong>{invitation.invitedBy.name || invitation.invitedBy.email}</strong>{" "}
              has invited you to join{" "}
              <strong>{invitation.organization.name}</strong> as a{" "}
              <strong>{roleLabels[invitation.role] || invitation.role}</strong>.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <a
              href={`/sign-in?redirect_url=/accept-invite/${token}`}
              className="block w-full rounded-lg bg-indigo-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Sign in to accept
            </a>
            <a
              href={`/sign-up?redirect_url=/accept-invite/${token}`}
              className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Create an account
            </a>
          </div>

          <p className="mt-4 text-center text-xs text-gray-500">
            Invitation for <strong>{invitation.email}</strong>
          </p>
        </div>
      </div>
    );
  }

  // User is logged in, show acceptance form
  return (
    <AcceptInviteClient
      token={token}
      invitation={{
        email: invitation.email,
        role: invitation.role,
        organization: invitation.organization,
        invitedBy: invitation.invitedBy,
      }}
    />
  );
}
