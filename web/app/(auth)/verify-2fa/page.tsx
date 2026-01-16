"use client";

import { useState, useEffect, Suspense } from "react";
import { useSignIn } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Shield, ArrowLeft, AlertCircle, Lock } from "lucide-react";
import { isValidTOTPFormat } from "@/lib/security";

function Verify2FAContent() {
  const { signIn, isLoaded, setActive } = useSignIn();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutMinutes, setLockoutMinutes] = useState(0);

  const redirectUrl = searchParams.get("redirect_url") || "/dashboard";

  useEffect(() => {
    // Check if we're in the right state for 2FA verification
    if (isLoaded && signIn?.status !== "needs_second_factor") {
      // Not in 2FA flow, redirect to sign-in
      router.replace("/sign-in");
    }
  }, [isLoaded, signIn, router]);

  const handleVerify = async () => {
    if (!signIn) return;

    setError(null);

    if (!isValidTOTPFormat(code)) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "totp",
        code,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(redirectUrl);
      } else {
        setError("Verification failed. Please try again.");
      }
    } catch (err) {
      const error = err as { errors?: { message: string; code?: string }[] };
      const errorMessage = error.errors?.[0]?.message || "Verification failed";
      const errorCode = error.errors?.[0]?.code;

      // Handle lockout scenario
      if (errorCode === "too_many_requests") {
        setIsLocked(true);
        setLockoutMinutes(15);
      } else {
        setError(errorMessage);
        // Decrement attempts (client-side tracking)
        if (attemptsRemaining !== null) {
          const remaining = attemptsRemaining - 1;
          setAttemptsRemaining(remaining);
          if (remaining <= 0) {
            setIsLocked(true);
            setLockoutMinutes(15);
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && code.length === 6 && !isLoading && !isLocked) {
      handleVerify();
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Back Link */}
        <Link
          href="/sign-in"
          className="mb-8 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>

        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
              <Shield className="h-7 w-7 text-indigo-600" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              Two-factor authentication
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          {/* Lockout State */}
          {isLocked && (
            <div className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 p-4">
              <Lock className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <p className="font-medium">Account temporarily locked</p>
                <p className="mt-1">
                  Too many failed attempts. Please try again in {lockoutMinutes} minutes
                  or use a recovery code.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && !isLocked && (
            <div className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 p-4">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <p>{error}</p>
                {attemptsRemaining !== null && attemptsRemaining > 0 && (
                  <p className="mt-1 text-red-600">
                    {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""}{" "}
                    remaining
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Code Input */}
          <div className="space-y-4">
            <div>
              <label htmlFor="code" className="sr-only">
                Verification code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                onKeyDown={handleKeyDown}
                placeholder="000000"
                disabled={isLocked}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl font-mono tracking-widest focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                autoFocus
                autoComplete="one-time-code"
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={isLoading || code.length !== 6 || isLocked}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? "Verifying..." : "Verify"}
            </button>
          </div>

          {/* Recovery Code Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Lost access to your authenticator?{" "}
              <Link
                href={`/use-recovery-code?redirect_url=${encodeURIComponent(redirectUrl)}`}
                className="font-medium text-indigo-600 hover:text-indigo-700"
              >
                Use a recovery code
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Verify2FAPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      }
    >
      <Verify2FAContent />
    </Suspense>
  );
}
