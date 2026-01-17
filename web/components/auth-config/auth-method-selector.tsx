"use client";

import type { AuthMethod } from "@/lib/types/auth";

interface AuthMethodSelectorProps {
  value: AuthMethod;
  onChange: (method: AuthMethod) => void;
  disabled?: boolean;
}

const AUTH_METHODS: { value: AuthMethod; label: string; description: string }[] = [
  {
    value: "NONE",
    label: "None",
    description: "No authentication required",
  },
  {
    value: "FORM",
    label: "Form Login",
    description: "Username/password form submission",
  },
  {
    value: "API_TOKEN",
    label: "API Token",
    description: "Bearer token or API key",
  },
  {
    value: "BASIC",
    label: "Basic Auth",
    description: "HTTP Basic Authentication",
  },
  {
    value: "SSO",
    label: "SSO (Coming Soon)",
    description: "Single Sign-On integration",
  },
];

export function AuthMethodSelector({
  value,
  onChange,
  disabled = false,
}: AuthMethodSelectorProps) {
  return (
    <div>
      <label
        htmlFor="authMethod"
        className="block text-sm font-medium text-gray-700"
      >
        Authentication Method
      </label>
      <select
        id="authMethod"
        value={value}
        onChange={(e) => onChange(e.target.value as AuthMethod)}
        disabled={disabled}
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        {AUTH_METHODS.map((method) => (
          <option
            key={method.value}
            value={method.value}
            disabled={method.value === "SSO"}
          >
            {method.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-sm text-gray-500">
        {AUTH_METHODS.find((m) => m.value === value)?.description}
      </p>
    </div>
  );
}
