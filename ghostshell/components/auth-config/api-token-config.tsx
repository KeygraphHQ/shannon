"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

interface ApiTokenConfigProps {
  config: {
    apiToken: string;
  };
  onChange: (config: ApiTokenConfigProps["config"]) => void;
  disabled?: boolean;
}

export function ApiTokenConfig({
  config,
  onChange,
  disabled = false,
}: ApiTokenConfigProps) {
  const [showToken, setShowToken] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="apiToken"
          className="block text-sm font-medium text-gray-700"
        >
          API Token <span className="text-red-500">*</span>
        </label>
        <div className="mt-1 relative">
          <input
            type={showToken ? "text" : "password"}
            id="apiToken"
            value={config.apiToken}
            onChange={(e) => onChange({ apiToken: e.target.value })}
            placeholder="Enter your API token or key"
            disabled={disabled}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-10 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm font-mono disabled:bg-gray-100"
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          >
            {showToken ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          This token will be sent as a Bearer token in the Authorization header
        </p>
      </div>
    </div>
  );
}
