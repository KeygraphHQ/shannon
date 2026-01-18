"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  ArrowLeft,
  Key,
  RefreshCw,
} from "lucide-react";
import { Enable2FA } from "@/components/enable-2fa";
import { Disable2FA } from "@/components/disable-2fa";
import { RecoveryCodesDownload } from "@/components/recovery-codes-download";

type View = "status" | "enable" | "disable" | "regenerate-codes";

export default function TwoFactorSettingsPage() {
  const { user, isLoaded } = useUser();
  const [view, setView] = useState<View>("status");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const has2FA = user?.twoFactorEnabled;
  const hasBackupCodes = user?.backupCodeEnabled;

  const handleEnableComplete = () => {
    setView("status");
    setMessage({
      type: "success",
      text: "Two-factor authentication has been enabled successfully.",
    });
  };

  const handleDisableComplete = () => {
    setView("status");
    setMessage({
      type: "success",
      text: "Two-factor authentication has been disabled.",
    });
  };

  const handleRegenerateCodes = async () => {
    try {
      const codes = await user?.createBackupCode();
      if (codes?.codes) {
        setNewBackupCodes(codes.codes);
        setView("regenerate-codes");
      }
    } catch {
      setMessage({
        type: "error",
        text: "Failed to regenerate backup codes. Please try again.",
      });
    }
  };

  const handleRegenerateComplete = () => {
    setView("status");
    setNewBackupCodes([]);
    setMessage({
      type: "success",
      text: "New backup codes have been generated. Your old codes are no longer valid.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings/security"
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Security
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Two-Factor Authentication
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Add an extra layer of security to your account with TOTP-based
          authentication.
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

      {/* Status View */}
      {view === "status" && (
        <div className="space-y-6">
          {/* Current Status */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Current Status
              </h2>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${
                    has2FA ? "bg-green-100" : "bg-gray-100"
                  }`}
                >
                  {has2FA ? (
                    <ShieldCheck className="h-7 w-7 text-green-600" />
                  ) : (
                    <ShieldOff className="h-7 w-7 text-gray-400" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">
                    {has2FA
                      ? "Two-factor authentication is enabled"
                      : "Two-factor authentication is disabled"}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {has2FA
                      ? "Your account requires a verification code in addition to your password when signing in."
                      : "Enable 2FA to add an extra layer of security to your account."}
                  </p>
                </div>
                {has2FA ? (
                  <button
                    onClick={() => {
                      setMessage(null);
                      setView("disable");
                    }}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
                  >
                    Disable 2FA
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setMessage(null);
                      setView("enable");
                    }}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                  >
                    Enable 2FA
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Backup Codes (only shown when 2FA is enabled) */}
          {has2FA && (
            <section className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-6 py-4">
                <div className="flex items-center gap-3">
                  <Key className="h-5 w-5 text-gray-400" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    Recovery Codes
                  </h2>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {hasBackupCodes
                        ? "Backup codes are available"
                        : "No backup codes generated"}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Recovery codes can be used to access your account if you lose
                      your authenticator device.
                    </p>
                  </div>
                  <button
                    onClick={handleRegenerateCodes}
                    className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {hasBackupCodes ? "Regenerate" : "Generate"}
                  </button>
                </div>
                {hasBackupCodes && (
                  <p className="mt-3 text-xs text-gray-500">
                    Regenerating codes will invalidate all existing codes.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Security Tips */}
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Security Tips
                </h2>
              </div>
            </div>
            <div className="p-6">
              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600">•</span>
                  Use an authenticator app like Google Authenticator, Authy, or
                  1Password for generating codes.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600">•</span>
                  Store your recovery codes in a secure location, such as a password
                  manager or a printed copy in a safe place.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600">•</span>
                  Never share your verification codes or recovery codes with anyone.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600">•</span>
                  If you lose access to your authenticator device, use a recovery
                  code to sign in and set up 2FA again.
                </li>
              </ul>
            </div>
          </section>
        </div>
      )}

      {/* Enable View */}
      {view === "enable" && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <Enable2FA
            onComplete={handleEnableComplete}
            onCancel={() => setView("status")}
          />
        </section>
      )}

      {/* Disable View */}
      {view === "disable" && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <Disable2FA
            onComplete={handleDisableComplete}
            onCancel={() => setView("status")}
          />
        </section>
      )}

      {/* Regenerate Codes View */}
      {view === "regenerate-codes" && newBackupCodes.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              New Recovery Codes Generated
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Your previous codes have been invalidated. Save these new codes now.
            </p>
          </div>
          <RecoveryCodesDownload
            codes={newBackupCodes}
            onComplete={handleRegenerateComplete}
          />
        </section>
      )}
    </div>
  );
}
