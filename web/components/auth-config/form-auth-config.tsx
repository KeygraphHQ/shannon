"use client";

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

export function FormAuthConfig({
  config,
  onChange,
  disabled = false,
}: FormAuthConfigProps) {
  const handleChange = (field: keyof FormAuthConfigProps["config"]) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onChange({ ...config, [field]: e.target.value });
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
          placeholder="https://example.com/login"
          disabled={disabled}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100"
        />
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
              placeholder="#username"
              disabled={disabled}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm font-mono disabled:bg-gray-100"
            />
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
              placeholder="#password"
              disabled={disabled}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm font-mono disabled:bg-gray-100"
            />
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
              placeholder="button[type='submit']"
              disabled={disabled}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm font-mono disabled:bg-gray-100"
            />
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
              placeholder=".dashboard-header"
              disabled={disabled}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm font-mono disabled:bg-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500">
              Element visible after successful login
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
