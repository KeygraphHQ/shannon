"use client";

import { useState, useCallback } from "react";

interface FormAuthConfigProps {
  config: {
    loginUrl: string;
    username: string;
    password: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    successIndicator: string;
  };
  onChange: (config: FormAuthConfigProps["config"]) => void;
  disabled?: boolean;
}

interface ValidationErrors {
  loginUrl?: string;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  successIndicator?: string;
}

// Validate URL format
function validateUrl(url: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "URL must use http or https protocol";
    }
    return undefined;
  } catch {
    return "Invalid URL format";
  }
}

// Validate CSS selector format (basic validation)
function validateCssSelector(selector: string): string | undefined {
  if (!selector) return undefined;

  // Check for obviously invalid patterns
  const invalidPatterns = [
    /^\s+$/,           // whitespace only
    /^[0-9]/,          // starts with number (invalid for class/id)
    /[<>]/,            // HTML tags
    /^\s*$/,           // empty after trim
  ];

  for (const pattern of invalidPatterns) {
    if (pattern.test(selector)) {
      return "Invalid CSS selector format";
    }
  }

  // Try to validate by using querySelectorAll (catches most syntax errors)
  try {
    // Create a temporary element to test the selector
    if (typeof document !== "undefined") {
      document.createElement("div").querySelectorAll(selector);
    }
    return undefined;
  } catch {
    return "Invalid CSS selector syntax";
  }
}

export function FormAuthConfig({
  config,
  onChange,
  disabled = false,
}: FormAuthConfigProps) {
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const handleChange = (field: keyof FormAuthConfigProps["config"]) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    onChange({ ...config, [field]: value });

    // Clear error on change
    if (errors[field as keyof ValidationErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleBlur = useCallback((field: keyof ValidationErrors) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));

    let error: string | undefined;
    if (field === "loginUrl") {
      error = validateUrl(config.loginUrl);
    } else {
      error = validateCssSelector(config[field] || "");
    }

    setErrors((prev) => ({ ...prev, [field]: error }));
  }, [config]);

  const getInputClassName = (field: keyof ValidationErrors) => {
    const hasError = touched[field] && errors[field];
    return `mt-1 block w-full rounded-md border ${
      hasError ? "border-red-300" : "border-gray-300"
    } px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100`;
  };

  const getSelectorInputClassName = (field: keyof ValidationErrors) => {
    const hasError = touched[field] && errors[field];
    return `mt-1 block w-full rounded-md border ${
      hasError ? "border-red-300" : "border-gray-300"
    } px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm font-mono disabled:bg-gray-100`;
  };

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="loginUrl"
          className="block text-sm font-medium text-gray-700"
        >
          Login URL <span className="text-red-500">*</span>
        </label>
        <input
          type="url"
          id="loginUrl"
          value={config.loginUrl}
          onChange={handleChange("loginUrl")}
          onBlur={handleBlur("loginUrl")}
          placeholder="https://example.com/login"
          disabled={disabled}
          className={getInputClassName("loginUrl")}
        />
        {touched.loginUrl && errors.loginUrl && (
          <p className="mt-1 text-xs text-red-600">{errors.loginUrl}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="username"
            className="block text-sm font-medium text-gray-700"
          >
            Username <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="username"
            value={config.username}
            onChange={handleChange("username")}
            placeholder="user@example.com"
            disabled={disabled}
            autoComplete="username"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700"
          >
            Password <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            id="password"
            value={config.password}
            onChange={handleChange("password")}
            placeholder="Enter password"
            disabled={disabled}
            autoComplete="current-password"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100"
          />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">
          CSS Selectors
        </h4>
        <p className="text-xs text-gray-500 mb-3">
          Enter CSS selectors to identify form elements. Example: #username, .login-input, input[name="email"]
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="usernameSelector"
              className="block text-sm font-medium text-gray-700"
            >
              Username Field <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="usernameSelector"
              value={config.usernameSelector}
              onChange={handleChange("usernameSelector")}
              onBlur={handleBlur("usernameSelector")}
              placeholder="#username"
              disabled={disabled}
              className={getSelectorInputClassName("usernameSelector")}
            />
            {touched.usernameSelector && errors.usernameSelector && (
              <p className="mt-1 text-xs text-red-600">{errors.usernameSelector}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="passwordSelector"
              className="block text-sm font-medium text-gray-700"
            >
              Password Field <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="passwordSelector"
              value={config.passwordSelector}
              onChange={handleChange("passwordSelector")}
              onBlur={handleBlur("passwordSelector")}
              placeholder="#password"
              disabled={disabled}
              className={getSelectorInputClassName("passwordSelector")}
            />
            {touched.passwordSelector && errors.passwordSelector && (
              <p className="mt-1 text-xs text-red-600">{errors.passwordSelector}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label
              htmlFor="submitSelector"
              className="block text-sm font-medium text-gray-700"
            >
              Submit Button <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="submitSelector"
              value={config.submitSelector}
              onChange={handleChange("submitSelector")}
              onBlur={handleBlur("submitSelector")}
              placeholder="button[type='submit']"
              disabled={disabled}
              className={getSelectorInputClassName("submitSelector")}
            />
            {touched.submitSelector && errors.submitSelector && (
              <p className="mt-1 text-xs text-red-600">{errors.submitSelector}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="successIndicator"
              className="block text-sm font-medium text-gray-700"
            >
              Success Indicator
            </label>
            <input
              type="text"
              id="successIndicator"
              value={config.successIndicator}
              onChange={handleChange("successIndicator")}
              onBlur={handleBlur("successIndicator")}
              placeholder=".dashboard-header"
              disabled={disabled}
              className={getSelectorInputClassName("successIndicator")}
            />
            {touched.successIndicator && errors.successIndicator ? (
              <p className="mt-1 text-xs text-red-600">{errors.successIndicator}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Element visible after successful login
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
