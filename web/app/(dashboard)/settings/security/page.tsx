"use client";

import { useState, useTransition } from "react";
import { useUser, useSession } from "@clerk/nextjs";
import { Shield, Key, Smartphone, LogOut, Clock, Globe } from "lucide-react";
import Link from "next/link";

export default function SecuritySettingsPage() {
  const { user, isLoaded } = useUser();
  const { session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const hasPassword = user?.passwordEnabled;

  const handleChangePassword = async () => {
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({
        type: "error",
        text: "Password must be at least 8 characters",
      });
      return;
    }

    // Check for at least one number
    if (!/\d/.test(newPassword)) {
      setMessage({
        type: "error",
        text: "Password must contain at least one number",
      });
      return;
    }

    startTransition(async () => {
      try {
        await user?.updatePassword({
          currentPassword: hasPassword ? currentPassword : undefined,
          newPassword,
        });
        setMessage({ type: "success", text: "Password updated successfully" });
        setShowPasswordForm(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } catch (err) {
        const error = err as { errors?: { message: string }[] };
        setMessage({
          type: "error",
          text:
            error.errors?.[0]?.message ||
            "Failed to update password. Please try again.",
        });
      }
    });
  };

  const handleSignOutOtherSessions = async () => {
    setMessage(null);
    startTransition(async () => {
      try {
        // Sign out all other sessions
        const sessions = await user?.getSessions();
        if (sessions) {
          for (const s of sessions) {
            if (s.id !== session?.id) {
              await s.revoke();
            }
          }
        }
        setMessage({
          type: "success",
          text: "All other sessions have been signed out",
        });
      } catch {
        setMessage({
          type: "error",
          text: "Failed to sign out other sessions",
        });
      }
    });
  };

  // Get 2FA status
  const has2FA = user?.twoFactorEnabled;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account security and authentication settings.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg p-4 ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Password Section */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Password</h2>
          </div>
        </div>
        <div className="p-6">
          {!showPasswordForm ? (
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900">
                  {hasPassword ? "Change Password" : "Set Password"}
                </h3>
                <p className="text-sm text-gray-500">
                  {hasPassword
                    ? "Update your password to keep your account secure"
                    : "Set a password to enable email/password login"}
                </p>
              </div>
              <button
                onClick={() => setShowPasswordForm(true)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {hasPassword ? "Change" : "Set Password"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {hasPassword && (
                <div>
                  <label
                    htmlFor="currentPassword"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Current Password
                  </label>
                  <input
                    type="password"
                    id="currentPassword"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}
              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-sm font-medium text-gray-700"
                >
                  New Password
                </label>
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters with at least 1 number"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700"
                >
                  Confirm New Password
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowPasswordForm(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setMessage(null);
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangePassword}
                  disabled={
                    isPending ||
                    !newPassword ||
                    !confirmPassword ||
                    (hasPassword && !currentPassword)
                  }
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Saving..." : "Update Password"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Two-Factor Authentication Section */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">
              Two-Factor Authentication
            </h2>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  has2FA ? "bg-green-100" : "bg-gray-100"
                }`}
              >
                <Shield
                  className={`h-5 w-5 ${has2FA ? "text-green-600" : "text-gray-400"}`}
                />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">
                  {has2FA ? "2FA is enabled" : "2FA is disabled"}
                </h3>
                <p className="text-sm text-gray-500">
                  {has2FA
                    ? "Your account is protected with two-factor authentication"
                    : "Add an extra layer of security to your account"}
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/settings/security/two-factor"
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                has2FA
                  ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {has2FA ? "Manage" : "Enable 2FA"}
            </Link>
          </div>
        </div>
      </section>

      {/* Active Sessions Section */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">
                Active Sessions
              </h2>
            </div>
            <button
              onClick={handleSignOutOtherSessions}
              disabled={isPending}
              className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
            >
              Sign out other sessions
            </button>
          </div>
        </div>
        <div className="p-6">
          {session && (
            <div className="flex items-center gap-4 rounded-lg border border-gray-200 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <LogOut className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900">Current Session</h3>
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    Active
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Started{" "}
                    {session.createdAt
                      ? new Date(session.createdAt).toLocaleDateString()
                      : "recently"}
                  </span>
                </div>
              </div>
            </div>
          )}
          <p className="mt-4 text-sm text-gray-500">
            If you notice any suspicious activity, sign out of all other
            sessions and change your password immediately.
          </p>
        </div>
      </section>
    </div>
  );
}
