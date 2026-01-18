"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Mail, RefreshCw, CheckCircle2, ArrowLeft } from "lucide-react";

export default function VerifyEmailPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    // Check if user's email is already verified
    if (user?.primaryEmailAddress?.verification?.status === "verified") {
      router.push("/dashboard");
    }
  }, [user, router]);

  const handleResendVerification = async () => {
    if (!user?.primaryEmailAddress) return;

    setIsResending(true);
    setError(null);
    setResendSuccess(false);

    try {
      await user.primaryEmailAddress.prepareVerification({
        strategy: "email_code",
      });
      setResendSuccess(true);
    } catch (err) {
      setError("Failed to resend verification email. Please try again.");
      console.error("Failed to resend verification:", err);
    } finally {
      setIsResending(false);
    }
  };

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const emailAddress = user?.primaryEmailAddress?.emailAddress;
  const isVerified =
    user?.primaryEmailAddress?.verification?.status === "verified";

  if (isVerified) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-lg">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              Email Verified!
            </h1>
            <p className="mt-2 text-gray-600">
              Your email has been successfully verified.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="flex items-center justify-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600">
              <span className="text-xl font-bold text-white">S</span>
            </div>
            <span className="text-xl font-semibold text-gray-900">Shannon</span>
          </Link>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-lg">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
              <Mail className="h-8 w-8 text-indigo-600" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              Verify your email
            </h1>
            <p className="mt-2 text-gray-600">
              We&apos;ve sent a verification link to
            </p>
            <p className="mt-1 font-medium text-gray-900">{emailAddress}</p>
          </div>

          <div className="mt-6 rounded-lg bg-gray-50 p-4">
            <h3 className="text-sm font-medium text-gray-900">Next steps:</h3>
            <ol className="mt-2 space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-600">
                  1
                </span>
                Check your email inbox
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-600">
                  2
                </span>
                Click the verification link in the email
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-600">
                  3
                </span>
                Return here to access your dashboard
              </li>
            </ol>
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {resendSuccess && (
            <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              Verification email sent! Check your inbox.
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button
              onClick={handleResendVerification}
              disabled={isResending}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={`h-4 w-4 ${isResending ? "animate-spin" : ""}`}
              />
              {isResending ? "Sending..." : "Resend verification email"}
            </button>

            <Link
              href="/sign-in"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Didn&apos;t receive the email? Check your spam folder or{" "}
          <button
            onClick={handleResendVerification}
            className="font-medium text-indigo-600 hover:text-indigo-700"
          >
            click here to resend
          </button>
        </p>
      </div>
    </div>
  );
}
