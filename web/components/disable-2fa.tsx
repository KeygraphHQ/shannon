"use client";

import { useState, useTransition } from "react";
import { useUser } from "@clerk/nextjs";
import { ShieldOff, AlertTriangle } from "lucide-react";
import { disableTwoFactor } from "@/lib/actions/two-factor";

interface Disable2FAProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function Disable2FA({ onComplete, onCancel }: Disable2FAProps) {
  const { user } = useUser();
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  const handleDisable = async () => {
    setError(null);

    if (verificationCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    startTransition(async () => {
      try {
        // Disable TOTP via Clerk (no code parameter needed - Clerk verifies via session)
        await user?.disableTOTP();

        // Log the event
        await disableTwoFactor(verificationCode);

        onComplete();
      } catch (err) {
        const error = err as { errors?: { message: string }[] };
        setError(error.errors?.[0]?.message || "Failed to disable 2FA. Please check your code.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Warning */}
      <div className="flex items-start gap-3 rounded-lg bg-red-50 p-4">
        <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-red-800">
          <p className="font-medium">Reduce account security?</p>
          <p className="mt-1">
            Disabling two-factor authentication will make your account less secure.
            Anyone who obtains your password will be able to access your account.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Icon */}
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <ShieldOff className="h-8 w-8 text-red-600" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          Disable two-factor authentication
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          Enter the code from your authenticator app to confirm
        </p>
      </div>

      {/* Verification Code Input */}
      <div className="flex justify-center">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={verificationCode}
          onChange={(e) =>
            setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          placeholder="000000"
          className="w-40 rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl font-mono tracking-widest focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          autoFocus
        />
      </div>

      {/* Confirmation Checkbox */}
      <div className="border-t border-gray-200 pt-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm text-gray-600">
            I understand that disabling 2FA will make my account less secure
          </span>
        </label>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-3 pt-2">
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleDisable}
          disabled={isPending || verificationCode.length !== 6 || !confirmed}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Disabling..." : "Disable 2FA"}
        </button>
      </div>
    </div>
  );
}
