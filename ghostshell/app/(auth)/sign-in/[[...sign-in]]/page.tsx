import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="mb-8 text-center">
        <Link href="/" className="flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600">
            <span className="text-xl font-bold text-white">S</span>
          </div>
          <span className="text-xl font-semibold text-gray-900">Shannon</span>
        </Link>
        <p className="mt-2 text-sm text-gray-600">
          Welcome back! Sign in to continue
        </p>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto w-full max-w-md",
            card: "shadow-lg rounded-xl border border-gray-200",
            headerTitle: "text-xl font-semibold text-gray-900",
            headerSubtitle: "text-gray-600",
            socialButtonsBlockButton:
              "border border-gray-300 hover:bg-gray-50 transition-colors",
            socialButtonsBlockButtonText: "text-gray-700 font-medium",
            dividerLine: "bg-gray-200",
            dividerText: "text-gray-500 text-sm",
            formFieldLabel: "text-gray-700 font-medium",
            formFieldInput:
              "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg",
            formButtonPrimary:
              "bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg",
            footerActionLink: "text-indigo-600 hover:text-indigo-700 font-medium",
            identityPreviewText: "text-gray-700",
            identityPreviewEditButton: "text-indigo-600 hover:text-indigo-700",
          },
        }}
        redirectUrl="/dashboard"
        signUpUrl="/sign-up"
      />
      <p className="mt-6 text-center text-sm text-gray-600">
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-indigo-600 hover:text-indigo-700"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
