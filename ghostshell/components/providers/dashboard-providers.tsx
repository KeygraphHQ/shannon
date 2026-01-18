"use client";

import { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";

interface DashboardProvidersProps {
  children: ReactNode;
}

export function DashboardProviders({ children }: DashboardProvidersProps) {
  return <ToastProvider>{children}</ToastProvider>;
}
