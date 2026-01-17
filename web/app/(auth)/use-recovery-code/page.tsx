"use client";

import { useState, useEffect, Suspense } from "react";
import { useSignIn } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Key, ArrowLeft, AlertCircle, AlertTriangle } from "lucide-react";
import { isValidBackupCodeFormat } from "@/lib/security";

function UseRecoveryCodeContent() {
  const { signIn, isLoaded, setActive } = useSignIn();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

    // Remove any dashes or spaces from the code
    const cleanCode = code.replace(/[-\s]/g, "");

    if (!isValidBackupCodeFormat(cleanCode)) {
      setError("Please enter a valid recovery code");
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "backup_code",
        code: cleanCode,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        // Redirect to security settings to encourage regenerating codes
        router.push("/dashboard/settings/security/two-factor?regenerate=true");
      } else {
        setError("Verification failed. Please try again.");
      }
    } catch (err) {
      const error = err as { errors?: { message: string }[] };
      setError(error.errors?.[0]?.message || "Invalid recovery code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && code.length >= 8 && !isLoading) {
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
          href={`/verify-2fa?redirect_url=${encodeURIComponent(redirectUrl)}`}
          className="mb-8 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to verification
        </Link>

        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <Key className="h-7 w-7 text-amber-600" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              Use a recovery code
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Enter one of your saved recovery codes to sign in
            </p>
          </div>

          {/* Warning */}
          <div className="mb-6 flex items-start gap-3 rounded-lg bg-amber-50 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Each code can only be used once</p>
              <p className="mt-1">
                After signing in, you should generate new recovery codes to maintain
                account security.
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg bg-red-50 p-4">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Code Input */}
          <div className="space-y-4">
            <div>
              <label htmlFor="recovery-code" className="sr-only">
                Recovery code
              </label>
              <input
                id="recovery-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter your recovery code"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center font-mono tracking-wide focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
                autoComplete="off"
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={isLoading || code.length < 8}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? "Verifying..." : "Sign in with recovery code"}
            </button>
          </div>

          {/* Help Text */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Don&apos;t have your recovery codes?{" "}
              <Link
                href="mailto:support@shannon.security"
                className="font-medium text-indigo-600 hover:text-indigo-700"
              >
                Contact support
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UseRecoveryCodePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      }
    >
      <UseRecoveryCodeContent />
    </Suspense>
  );
}
