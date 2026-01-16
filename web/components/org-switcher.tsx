"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Check, Building2 } from "lucide-react";

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
}

interface OrgSwitcherProps {
  organizations: Organization[];
  currentOrgId: string;
}

export function OrgSwitcher({ organizations, currentOrgId }: OrgSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const currentOrg = organizations.find((org) => org.id === currentOrgId);

  const handleSelect = (orgId: string) => {
    // Store selected org in cookie
    document.cookie = `current_org=${orgId};path=/;max-age=31536000`;
    setIsOpen(false);
    router.refresh();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Building2 className="h-4 w-4 text-gray-500" />
        <span className="max-w-[150px] truncate">
          {currentOrg?.name || "Select Organization"}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Your Organizations
            </div>
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => handleSelect(org.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <div className="text-left">
                    <div className="font-medium truncate max-w-[150px]">
                      {org.name}
                    </div>
                    <div className="text-xs text-gray-500 capitalize">
                      {org.plan} • {org.role}
                    </div>
                  </div>
                </div>
                {org.id === currentOrgId && (
                  <Check className="h-4 w-4 text-indigo-600" />
                )}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push("/dashboard/settings?tab=new-org");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4 text-gray-400" />
                <span>Create Organization</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
