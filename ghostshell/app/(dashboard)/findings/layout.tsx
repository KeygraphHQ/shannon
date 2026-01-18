import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Findings | Shannon",
  description: "Security findings and remediation management",
};

export default function FindingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
