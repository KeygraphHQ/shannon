"use client";

import { Eye, EyeOff, Info } from "lucide-react";
import { useState } from "react";

interface TotpConfigProps {
  config: {
    totpEnabled: boolean;
    totpSecret: string;
    totpSelector: string;
  };
  onChange: (config: TotpConfigProps["config"]) => void;
  disabled?: boolean;
}

export function TotpConfig({
  config,
  onChange,
  disabled = false,
}: TotpConfigProps) {
  const [showSecret, setShowSecret] = useState(false);

  const handleChange = <K extends keyof TotpConfigProps["config"]>(
    field: K,
    value: TotpConfigProps["config"][K]
  ) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="space-y-4 border-t border-gray-200 pt-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          <input
            type="checkbox"
            id="totpEnabled"
            checked={config.totpEnabled}
            onChange={(e) => handleChange("totpEnabled", e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label
            htmlFor="totpEnabled"
            className="text-sm font-medium text-gray-700"
          >
            Enable TOTP (Two-Factor Authentication)
          </label>
          <p className="text-xs text-gray-500 mt-1">
            Required if the application uses time-based one-time passwords for 2FA
          </p>
        </div>
      </div>

      {config.totpEnabled && (
        <div className="ml-7 space-y-4">
          <div className="rounded-md bg-blue-50 p-3">
            <div className="flex">
              <Info className="h-5 w-5 text-blue-400 flex-shrink-0" />
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  Enter the TOTP secret (usually shown as a base32-encoded
                  string when setting up 2FA, e.g., JBSWY3DPEHPK3PXP).
                  Shannon will generate valid codes during authentication.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="totpSecret"
              className="block text-sm font-medium text-gray-700"
            >
              TOTP Secret <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 relative">
              <input
                type={showSecret ? "text" : "password"}
                id="totpSecret"
                value={config.totpSecret}
                onChange={(e) => handleChange("totpSecret", e.target.value)}
                placeholder="JBSWY3DPEHPK3PXP"
                disabled={disabled}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 pr-10 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm font-mono disabled:bg-gray-100"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="totpSelector"
              className="block text-sm font-medium text-gray-700"
            >
              TOTP Input Selector <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="totpSelector"
              value={config.totpSelector}
              onChange={(e) => handleChange("totpSelector", e.target.value)}
              placeholder="#totp-code"
              disabled={disabled}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm font-mono disabled:bg-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500">
              CSS selector for the TOTP code input field
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
