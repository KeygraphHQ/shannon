"use client";

interface BasicAuthConfigProps {
  config: {
    username: string;
    password: string;
  };
  onChange: (config: BasicAuthConfigProps["config"]) => void;
  disabled?: boolean;
}

export function BasicAuthConfig({
  config,
  onChange,
  disabled = false,
}: BasicAuthConfigProps) {
  const handleChange = (field: keyof BasicAuthConfigProps["config"]) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onChange({ ...config, [field]: e.target.value });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Configure HTTP Basic Authentication credentials. These will be sent in
        the Authorization header as Base64-encoded username:password.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="basicUsername"
            className="block text-sm font-medium text-gray-700"
          >
            Username <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="basicUsername"
            value={config.username}
            onChange={handleChange("username")}
            placeholder="Enter username"
            disabled={disabled}
            autoComplete="username"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100"
          />
        </div>
        <div>
          <label
            htmlFor="basicPassword"
            className="block text-sm font-medium text-gray-700"
          >
            Password <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            id="basicPassword"
            value={config.password}
            onChange={handleChange("password")}
            placeholder="Enter password"
            disabled={disabled}
            autoComplete="current-password"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100"
          />
        </div>
      </div>
    </div>
  );
}
