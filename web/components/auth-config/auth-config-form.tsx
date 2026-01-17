"use client";

import { useState, useEffect } from "react";
import { Save, Loader2, Trash2, Shield } from "lucide-react";
import { AuthMethodSelector } from "./auth-method-selector";
import { FormAuthConfig } from "./form-auth-config";
import { ApiTokenConfig } from "./api-token-config";
import { BasicAuthConfig } from "./basic-auth-config";
import { TotpConfig } from "./totp-config";
import { TestAuthButton } from "./test-auth-button";
import type { AuthMethod } from "@/lib/types/auth";

interface AuthConfigFormProps {
  projectId: string;
  initialConfig?: {
    method: AuthMethod;
    loginUrl: string | null;
    usernameSelector: string | null;
    passwordSelector: string | null;
    submitSelector: string | null;
    successIndicator: string | null;
    hasCredentials: boolean;
    totpEnabled: boolean;
    totpSelector: string | null;
    lastValidatedAt: Date | null;
    validationStatus: string | null;
  };
}

interface FormState {
  method: AuthMethod;
  // Form auth
  loginUrl: string;
  username: string;
  password: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  successIndicator: string;
  // API Token
  apiToken: string;
  // TOTP
  totpEnabled: boolean;
  totpSecret: string;
  totpSelector: string;
}

const DEFAULT_STATE: FormState = {
  method: "NONE",
  loginUrl: "",
  username: "",
  password: "",
  usernameSelector: "",
  passwordSelector: "",
  submitSelector: "",
  successIndicator: "",
  apiToken: "",
  totpEnabled: false,
  totpSecret: "",
  totpSelector: "",
};

export function AuthConfigForm({ projectId, initialConfig }: AuthConfigFormProps) {
  const [formState, setFormState] = useState<FormState>(() => {
    if (initialConfig) {
      return {
        ...DEFAULT_STATE,
        method: initialConfig.method,
        loginUrl: initialConfig.loginUrl || "",
        usernameSelector: initialConfig.usernameSelector || "",
        passwordSelector: initialConfig.passwordSelector || "",
        submitSelector: initialConfig.submitSelector || "",
        successIndicator: initialConfig.successIndicator || "",
        totpEnabled: initialConfig.totpEnabled,
        totpSelector: initialConfig.totpSelector || "",
      };
    }
    return DEFAULT_STATE;
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Track changes
  useEffect(() => {
    setHasChanges(true);
    setSuccess(false);
  }, [formState]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/projects/${projectId}/auth`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: formState.method,
          loginUrl: formState.loginUrl || undefined,
          username: formState.username || undefined,
          password: formState.password || undefined,
          usernameSelector: formState.usernameSelector || undefined,
          passwordSelector: formState.passwordSelector || undefined,
          submitSelector: formState.submitSelector || undefined,
          successIndicator: formState.successIndicator || undefined,
          apiToken: formState.apiToken || undefined,
          totpEnabled: formState.totpEnabled,
          totpSecret: formState.totpSecret || undefined,
          totpSelector: formState.totpSelector || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save configuration");
      }

      setSuccess(true);
      setHasChanges(false);
      // Clear sensitive fields after save
      setFormState((prev) => ({
        ...prev,
        password: "",
        apiToken: "",
        totpSecret: "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to remove authentication configuration?")) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/auth`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 204) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete configuration");
      }

      // Reset form
      setFormState(DEFAULT_STATE);
      setSuccess(false);
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete configuration");
    } finally {
      setDeleting(false);
    }
  };

  const showTestButton = formState.method !== "NONE" && !hasChanges;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
        <Shield className="h-6 w-6 text-indigo-600" />
        <div>
          <h3 className="text-lg font-medium text-gray-900">
            Authentication Configuration
          </h3>
          <p className="text-sm text-gray-500">
            Configure how Shannon authenticates with your application
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-4">
          <p className="text-sm text-green-700">
            Configuration saved successfully
          </p>
        </div>
      )}

      <AuthMethodSelector
        value={formState.method}
        onChange={(method) => setFormState({ ...formState, method })}
        disabled={saving || deleting}
      />

      {formState.method === "FORM" && (
        <>
          <FormAuthConfig
            config={{
              loginUrl: formState.loginUrl,
              username: formState.username,
              password: formState.password,
              usernameSelector: formState.usernameSelector,
              passwordSelector: formState.passwordSelector,
              submitSelector: formState.submitSelector,
              successIndicator: formState.successIndicator,
            }}
            onChange={(config) => setFormState({ ...formState, ...config })}
            disabled={saving || deleting}
          />
          <TotpConfig
            config={{
              totpEnabled: formState.totpEnabled,
              totpSecret: formState.totpSecret,
              totpSelector: formState.totpSelector,
            }}
            onChange={(config) => setFormState({ ...formState, ...config })}
            disabled={saving || deleting}
          />
        </>
      )}

      {formState.method === "API_TOKEN" && (
        <ApiTokenConfig
          config={{ apiToken: formState.apiToken }}
          onChange={(config) => setFormState({ ...formState, ...config })}
          disabled={saving || deleting}
        />
      )}

      {formState.method === "BASIC" && (
        <BasicAuthConfig
          config={{
            username: formState.username,
            password: formState.password,
          }}
          onChange={(config) => setFormState({ ...formState, ...config })}
          disabled={saving || deleting}
        />
      )}

      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || deleting}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Configuration
              </>
            )}
          </button>

          {formState.method !== "NONE" && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-red-600 ring-1 ring-inset ring-red-300 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Remove
                </>
              )}
            </button>
          )}
        </div>

        {showTestButton && (
          <TestAuthButton projectId={projectId} disabled={saving || deleting} />
        )}
      </div>

      {initialConfig?.lastValidatedAt && initialConfig?.validationStatus && (
        <div className="text-xs text-gray-500 text-right">
          Last validated:{" "}
          {new Date(initialConfig.lastValidatedAt).toLocaleString()} (
          <span
            className={
              initialConfig.validationStatus === "valid"
                ? "text-green-600"
                : initialConfig.validationStatus === "invalid"
                  ? "text-red-600"
                  : "text-yellow-600"
            }
          >
            {initialConfig.validationStatus}
          </span>
          )
        </div>
      )}
    </div>
  );
}
