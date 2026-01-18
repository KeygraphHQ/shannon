"use client";

import { useUser } from "@clerk/nextjs";
import { Shield, ShieldCheck, ShieldAlert } from "lucide-react";
import Link from "next/link";

interface TwoFactorStatusProps {
  variant?: "badge" | "inline" | "full";
  showLink?: boolean;
}

export function TwoFactorStatus({ variant = "badge", showLink = true }: TwoFactorStatusProps) {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return null;
  }

  const has2FA = user?.twoFactorEnabled;

  if (variant === "badge") {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          has2FA
            ? "bg-green-100 text-green-800"
            : "bg-amber-100 text-amber-800"
        }`}
        title={has2FA ? "2FA enabled" : "2FA not enabled"}
      >
        {has2FA ? (
          <>
            <ShieldCheck className="mr-1 h-3 w-3" />
            2FA
          </>
        ) : (
          <>
            <ShieldAlert className="mr-1 h-3 w-3" />
            No 2FA
          </>
        )}
      </span>
    );
  }

  if (variant === "inline") {
    const content = (
      <div
        className={`flex items-center gap-1.5 text-xs ${
          has2FA ? "text-green-600" : "text-amber-600"
        }`}
      >
        {has2FA ? (
          <ShieldCheck className="h-3.5 w-3.5" />
        ) : (
          <ShieldAlert className="h-3.5 w-3.5" />
        )}
        <span>{has2FA ? "2FA enabled" : "Enable 2FA"}</span>
      </div>
    );

    if (showLink && !has2FA) {
      return (
        <Link
          href="/dashboard/settings/security/two-factor"
          className="hover:underline"
        >
          {content}
        </Link>
      );
    }

    return content;
  }

  // Full variant - more detailed display
  return (
    <div
      className={`flex items-center gap-3 rounded-lg p-3 ${
        has2FA ? "bg-green-50" : "bg-amber-50"
      }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full ${
          has2FA ? "bg-green-100" : "bg-amber-100"
        }`}
      >
        {has2FA ? (
          <ShieldCheck className={`h-5 w-5 text-green-600`} />
        ) : (
          <Shield className={`h-5 w-5 text-amber-600`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium ${
            has2FA ? "text-green-800" : "text-amber-800"
          }`}
        >
          {has2FA ? "2FA is enabled" : "2FA is not enabled"}
        </p>
        <p className={`text-xs ${has2FA ? "text-green-600" : "text-amber-600"}`}>
          {has2FA
            ? "Your account is protected"
            : "Add extra security to your account"}
        </p>
      </div>
      {showLink && (
        <Link
          href="/dashboard/settings/security/two-factor"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            has2FA
              ? "text-green-700 hover:bg-green-100"
              : "bg-amber-600 text-white hover:bg-amber-700"
          }`}
        >
          {has2FA ? "Manage" : "Enable"}
        </Link>
      )}
    </div>
  );
}
