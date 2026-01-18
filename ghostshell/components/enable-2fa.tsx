"use client";

import { useState, useTransition } from "react";
import { useUser } from "@clerk/nextjs";
import { QrCode, Smartphone, CheckCircle, Copy, Check } from "lucide-react";
import { RecoveryCodesDownload } from "./recovery-codes-download";
import { verifyTOTPEnable } from "@/lib/actions/two-factor";

type Step = "intro" | "qr" | "verify" | "backup" | "complete";

interface Enable2FAProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function Enable2FA({ onComplete, onCancel }: Enable2FAProps) {
  const { user, isLoaded } = useUser();
  const [step, setStep] = useState<Step>("intro");
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [totpData, setTotpData] = useState<{
    uri: string;
    secret: string;
  } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedSecret, setCopiedSecret] = useState(false);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const handleStartSetup = async () => {
    setError(null);
    startTransition(async () => {
      try {
        // Create TOTP via Clerk
        const totp = await user?.createTOTP();
        if (totp) {
          setTotpData({
            uri: totp.uri || "",
            secret: totp.secret || "",
          });
          setStep("qr");
        }
      } catch (err) {
        const error = err as { errors?: { message: string }[] };
        setError(error.errors?.[0]?.message || "Failed to start 2FA setup");
      }
    });
  };

  const handleVerifyCode = async () => {
    setError(null);
    if (verificationCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    startTransition(async () => {
      try {
        // Verify TOTP code via Clerk
        const result = await user?.verifyTOTP({ code: verificationCode });
        if (result?.verified) {
          // Log the event
          await verifyTOTPEnable(verificationCode);

          // Generate backup codes
          const codes = await user?.createBackupCode();
          if (codes?.codes) {
            setBackupCodes(codes.codes);
          }
          setStep("backup");
        } else {
          setError("Invalid verification code. Please try again.");
        }
      } catch (err) {
        const error = err as { errors?: { message: string }[] };
        setError(error.errors?.[0]?.message || "Verification failed");
      }
    });
  };

  const handleCopySecret = async () => {
    if (totpData?.secret) {
      await navigator.clipboard.writeText(totpData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const handleBackupComplete = () => {
    setStep("complete");
    setTimeout(() => {
      onComplete();
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center space-x-2">
        {(["intro", "qr", "verify", "backup", "complete"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`h-2 w-2 rounded-full ${
                step === s
                  ? "bg-indigo-600"
                  : ["intro", "qr", "verify", "backup", "complete"].indexOf(step) > i
                    ? "bg-indigo-400"
                    : "bg-gray-200"
              }`}
            />
            {i < 4 && <div className="h-0.5 w-8 bg-gray-200" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Step: Intro */}
      {step === "intro" && (
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
            <Smartphone className="h-8 w-8 text-indigo-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            Set up two-factor authentication
          </h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Two-factor authentication adds an extra layer of security to your account.
            You&apos;ll need an authenticator app like Google Authenticator, Authy, or
            1Password.
          </p>
          <div className="flex justify-center gap-3 pt-4">
            <button
              onClick={onCancel}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleStartSetup}
              disabled={isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Setting up..." : "Continue"}
            </button>
          </div>
        </div>
      )}

      {/* Step: QR Code */}
      {step === "qr" && totpData && (
        <div className="text-center space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Scan QR code
          </h3>
          <p className="text-sm text-gray-600">
            Scan this QR code with your authenticator app
          </p>

          <div className="flex justify-center">
            <div className="rounded-lg border border-gray-200 p-4 bg-white">
              {totpData.uri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpData.uri)}`}
                  alt="2FA QR Code"
                  className="h-48 w-48"
                />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center bg-gray-100">
                  <QrCode className="h-12 w-12 text-gray-400" />
                </div>
              )}
            </div>
          </div>

          <div className="text-sm text-gray-600">
            <p className="mb-2">Can&apos;t scan? Enter this code manually:</p>
            <div className="flex items-center justify-center gap-2">
              <code className="rounded bg-gray-100 px-3 py-1.5 font-mono text-sm">
                {totpData.secret}
              </code>
              <button
                onClick={handleCopySecret}
                className="p-1.5 text-gray-500 hover:text-gray-700 transition-colors"
                title="Copy secret"
              >
                {copiedSecret ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex justify-center gap-3 pt-4">
            <button
              onClick={() => setStep("intro")}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep("verify")}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step: Verify */}
      {step === "verify" && (
        <div className="text-center space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Enter verification code
          </h3>
          <p className="text-sm text-gray-600">
            Enter the 6-digit code from your authenticator app
          </p>

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
              className="w-40 rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl font-mono tracking-widest focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          <div className="flex justify-center gap-3 pt-4">
            <button
              onClick={() => setStep("qr")}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleVerifyCode}
              disabled={isPending || verificationCode.length !== 6}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Verifying..." : "Verify"}
            </button>
          </div>
        </div>
      )}

      {/* Step: Backup Codes */}
      {step === "backup" && (
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">
              Save your recovery codes
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Save these codes in a secure place. You can use them to access your
              account if you lose your authenticator device.
            </p>
          </div>

          <RecoveryCodesDownload
            codes={backupCodes}
            onComplete={handleBackupComplete}
          />
        </div>
      )}

      {/* Step: Complete */}
      {step === "complete" && (
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            Two-factor authentication enabled
          </h3>
          <p className="text-sm text-gray-600">
            Your account is now protected with an additional layer of security.
          </p>
        </div>
      )}
    </div>
  );
}
