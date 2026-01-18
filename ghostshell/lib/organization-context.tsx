"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

interface OrganizationContextType {
  currentOrgId: string | null;
  organizations: Organization[];
  setCurrentOrg: (orgId: string) => Promise<void>;
  refreshOrganizations: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(
  undefined
);

interface OrganizationProviderProps {
  children: React.ReactNode;
  initialOrgId: string;
  initialOrganizations: Organization[];
}

export function OrganizationProvider({
  children,
  initialOrgId,
  initialOrganizations,
}: OrganizationProviderProps) {
  const [currentOrgId, setCurrentOrgId] = useState<string>(initialOrgId);
  const [organizations, setOrganizations] =
    useState<Organization[]>(initialOrganizations);

  /**
   * Switch the current organization.
   * This updates the cookie and refreshes the page to reload server components.
   */
  const setCurrentOrg = async (orgId: string) => {
    try {
      // Call server action to set cookie
      const response = await fetch("/api/org/switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orgId }),
      });

      if (!response.ok) {
        throw new Error("Failed to switch organization");
      }

      // Update local state
      setCurrentOrgId(orgId);

      // Refresh the page to reload server components with new org context
      window.location.reload();
    } catch (error) {
      console.error("Error switching organization:", error);
      throw error;
    }
  };

  /**
   * Refresh the list of organizations from the server.
   */
  const refreshOrganizations = async () => {
    try {
      const response = await fetch("/api/org/list");
      if (!response.ok) {
        throw new Error("Failed to fetch organizations");
      }

      const data = await response.json();
      setOrganizations(data.organizations);
    } catch (error) {
      console.error("Error refreshing organizations:", error);
      throw error;
    }
  };

  return (
    <OrganizationContext.Provider
      value={{
        currentOrgId,
        organizations,
        setCurrentOrg,
        refreshOrganizations,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

/**
 * Hook to access the organization context.
 * Must be used within an OrganizationProvider.
 */
export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error(
      "useOrganization must be used within an OrganizationProvider"
    );
  }
  return context;
}

/**
 * Get the current organization from the context.
 */
export function useCurrentOrganization() {
  const { currentOrgId, organizations } = useOrganization();
  return organizations.find((org) => org.id === currentOrgId) || null;
}
