import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Shield, Zap, Lock, BarChart3, ArrowRight } from "lucide-react";

export default async function HomePage() {
  const { userId } = await auth();

  // If user is signed in, redirect to dashboard
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <span className="text-lg font-bold text-white">S</span>
            </div>
            <span className="text-lg font-semibold text-gray-900">Shannon</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            AI-Powered Security Testing
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            Automated penetration testing that finds vulnerabilities before
            attackers do. Run your first security scan in under 5 minutes.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#features"
              className="text-base font-semibold text-gray-700 hover:text-gray-900"
            >
              Learn more →
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-gray-100 bg-gray-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              Security testing made simple
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Enterprise-grade security testing accessible to every team.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={Shield}
              title="Comprehensive Scanning"
              description="Test for OWASP Top 10, injection attacks, authentication flaws, and more."
            />
            <FeatureCard
              icon={Zap}
              title="AI-Powered Analysis"
              description="Autonomous AI agents that think like real penetration testers."
            />
            <FeatureCard
              icon={Lock}
              title="Secure by Design"
              description="Your data is encrypted and isolated. SOC2 compliant infrastructure."
            />
            <FeatureCard
              icon={BarChart3}
              title="Actionable Reports"
              description="Clear remediation guidance with executive summaries and technical details."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-indigo-600 px-8 py-16 text-center sm:px-16">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Ready to secure your applications?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-indigo-100">
              Start your free trial today. No credit card required.
            </p>
            <Link
              href="/sign-up"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              Get Started for Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                <span className="text-lg font-bold text-white">S</span>
              </div>
              <span className="text-lg font-semibold text-gray-900">Shannon</span>
            </div>
            <p className="text-sm text-gray-500">
              © 2026 Shannon. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50">
        <Icon className="h-6 w-6 text-indigo-600" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
    </div>
  );
}
